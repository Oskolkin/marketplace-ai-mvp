"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveChatSession,
  askChat,
  createChatFeedback,
  getChatMessages,
  getChatSessions,
  type AskChatResponse,
  type ChatFeedbackRating,
  type ChatMessage,
  type ChatSession,
  type SupportingFact,
} from "@/lib/chat-api";

type MessageMeta = {
  summary: string;
  intent: string;
  confidence_level: string;
  related_alert_ids: number[];
  related_recommendation_ids: number[];
  supporting_facts: SupportingFact[];
  limitations: string[];
  trace_id: number;
};

const SUGGESTED_PROMPTS = [
  "Какие 5 действий мне сделать сегодня?",
  "Почему система советует это действие?",
  "Какие товары сейчас опасно рекламировать?",
  "Где я теряю деньги из-за рекламы?",
  "Какие SKU требуют внимания?",
  "Сделай ABC-анализ товаров.",
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function ChatScreen() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageMetaById, setMessageMetaById] = useState<Record<number, MessageMeta>>({});

  const [inputValue, setInputValue] = useState("");
  const [asOfDate, setAsOfDate] = useState("");

  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [archivingSessionId, setArchivingSessionId] = useState<number | null>(null);
  const [feedbackLoadingByMessage, setFeedbackLoadingByMessage] = useState<Record<number, boolean>>({});

  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );
  const selectedIsArchived = selectedSession?.status === "archived";

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const data = await getChatSessions({ limit: 50, offset: 0 });
      setSessions(data.items ?? []);
      if (data.items?.length && selectedSessionId == null) {
        const firstActive = data.items.find((s) => s.status === "active");
        setSelectedSessionId(firstActive?.id ?? data.items[0].id);
      }
    } catch (e: unknown) {
      setSessions([]);
      setSessionsError(e instanceof Error ? e.message : "Failed to load chat sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, [selectedSessionId]);

  const loadMessages = useCallback(async (sessionId: number) => {
    setLoadingMessages(true);
    setMessagesError(null);
    try {
      const data = await getChatMessages(sessionId, { limit: 200, offset: 0 });
      setMessages(data.items ?? []);
    } catch (e: unknown) {
      setMessages([]);
      setMessagesError(e instanceof Error ? e.message : "Failed to load chat messages");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (selectedSessionId == null) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedSessionId);
  }, [selectedSessionId, loadMessages]);

  async function handleAskSubmit() {
    const question = inputValue.trim();
    if (!question || sending || selectedIsArchived) return;
    setSending(true);
    setAskError(null);
    setFeedbackError(null);
    setFeedbackMessage(null);
    try {
      const response = await askChat({
        session_id: selectedSessionId ?? undefined,
        question,
        as_of_date: asOfDate.trim() || undefined,
      });
      await applyAskResponse(response);
      setInputValue("");
      await loadSessions();
    } catch (e: unknown) {
      setAskError(e instanceof Error ? e.message : "Failed to send chat question");
    } finally {
      setSending(false);
    }
  }

  async function applyAskResponse(response: AskChatResponse) {
    setSelectedSessionId(response.session_id);
    if (response.assistant_message_id != null) {
      setMessageMetaById((prev) => ({
        ...prev,
        [response.assistant_message_id as number]: {
          summary: response.summary,
          intent: response.intent,
          confidence_level: response.confidence_level,
          related_alert_ids: response.related_alert_ids ?? [],
          related_recommendation_ids: response.related_recommendation_ids ?? [],
          supporting_facts: response.supporting_facts ?? [],
          limitations: response.limitations ?? [],
          trace_id: response.trace_id,
        },
      }));
    }
    await loadMessages(response.session_id);
  }

  function handleNewChat() {
    setSelectedSessionId(null);
    setMessages([]);
    setInputValue("");
    setAskError(null);
    setMessagesError(null);
    setFeedbackMessage(null);
    setFeedbackError(null);
    setMessageMetaById({});
  }

  async function handleArchiveSession(sessionId: number) {
    setArchivingSessionId(sessionId);
    setSessionsError(null);
    try {
      await archiveChatSession(sessionId);
      await loadSessions();
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setMessages([]);
      }
    } catch (e: unknown) {
      setSessionsError(e instanceof Error ? e.message : "Failed to archive session");
    } finally {
      setArchivingSessionId(null);
    }
  }

  async function handleFeedback(message: ChatMessage, rating: ChatFeedbackRating) {
    setFeedbackError(null);
    setFeedbackMessage(null);
    setFeedbackLoadingByMessage((prev) => ({ ...prev, [message.id]: true }));
    try {
      await createChatFeedback(message.id, {
        session_id: message.session_id,
        rating,
      });
      setFeedbackMessage(`Feedback saved for message #${message.id}.`);
    } catch (e: unknown) {
      setFeedbackError(e instanceof Error ? e.message : "Failed to save feedback");
    } finally {
      setFeedbackLoadingByMessage((prev) => ({ ...prev, [message.id]: false }));
    }
  }

  return (
    <main className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">AI Chat</h1>
        <p className="mt-1 text-sm text-gray-600">
          Natural language access to your store data, alerts, and AI recommendations.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Chats</h2>
            <button
              type="button"
              className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
              onClick={handleNewChat}
            >
              New chat
            </button>
          </div>
          {loadingSessions ? <p className="text-sm">Loading sessions...</p> : null}
          {sessionsError ? <p className="mb-2 text-sm text-red-700">{sessionsError}</p> : null}
          {!loadingSessions && sessions.length === 0 ? (
            <p className="text-sm text-gray-600">No chats yet.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="rounded border p-2">
                  <button
                    type="button"
                    className={`w-full text-left ${selectedSessionId === s.id ? "font-semibold" : ""}`}
                    onClick={() => setSelectedSessionId(s.id)}
                  >
                    <div className="truncate">{s.title}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      <span className="rounded border px-1 py-0.5">{s.status}</span>
                      <span className="ml-2">updated {fmtDate(s.updated_at)}</span>
                    </div>
                  </button>
                  {s.status !== "archived" ? (
                    <button
                      type="button"
                      disabled={archivingSessionId === s.id}
                      className="mt-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => void handleArchiveSession(s.id)}
                    >
                      {archivingSessionId === s.id ? "Archiving..." : "Archive"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversation</h2>
            {selectedSession ? (
              <span className="text-xs text-gray-600">
                Session #{selectedSession.id} <span className="rounded border px-1 py-0.5">{selectedSession.status}</span>
              </span>
            ) : (
              <span className="text-xs text-gray-600">New session will be created on first ask</span>
            )}
          </div>

          {messagesError ? <p className="mb-3 text-sm text-red-700">{messagesError}</p> : null}
          {askError ? <p className="mb-3 text-sm text-red-700">{askError}</p> : null}
          {feedbackError ? <p className="mb-3 text-sm text-red-700">{feedbackError}</p> : null}
          {feedbackMessage ? <p className="mb-3 text-sm text-green-700">{feedbackMessage}</p> : null}

          <div className="max-h-[520px] space-y-3 overflow-auto rounded border bg-gray-50 p-3">
            {loadingMessages ? (
              <p className="text-sm">Loading messages...</p>
            ) : messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">Ask a question about your store.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded border bg-white px-3 py-1 text-sm hover:bg-gray-100"
                      onClick={() => setInputValue(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                const meta = messageMetaById[m.id];
                const feedbackDisabled = !!feedbackLoadingByMessage[m.id];
                return (
                  <article
                    key={m.id}
                    className={`rounded border bg-white p-3 ${isUser ? "ml-auto max-w-[85%]" : "mr-auto max-w-[90%]"}`}
                  >
                    <div className="mb-1 text-xs text-gray-600">
                      <span className="font-medium">{isUser ? "You" : "AI"}</span>
                      <span className="ml-2">{fmtDate(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-900">{m.content}</p>

                    {!isUser && meta ? (
                      <div className="mt-3 space-y-2 rounded border bg-gray-50 p-2 text-xs">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded border px-2 py-0.5">intent: {meta.intent}</span>
                          <span className="rounded border px-2 py-0.5">confidence: {meta.confidence_level}</span>
                          <span className="rounded border px-2 py-0.5">trace #{meta.trace_id}</span>
                        </div>
                        {meta.summary ? (
                          <p>
                            <b>Summary:</b> {meta.summary}
                          </p>
                        ) : null}
                        {meta.related_alert_ids.length > 0 ? (
                          <p>
                            <b>Related alerts:</b>{" "}
                            {meta.related_alert_ids.map((id, idx) => (
                              <span key={id}>
                                <Link href="/app/alerts" className="text-blue-700 underline">
                                  Alert #{id}
                                </Link>
                                {idx < meta.related_alert_ids.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </p>
                        ) : null}
                        {meta.related_recommendation_ids.length > 0 ? (
                          <p>
                            <b>Related recommendations:</b>{" "}
                            {meta.related_recommendation_ids.map((id, idx) => (
                              <span key={id}>
                                <Link href="/app/recommendations" className="text-blue-700 underline">
                                  Recommendation #{id}
                                </Link>
                                {idx < meta.related_recommendation_ids.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </p>
                        ) : null}
                        {meta.supporting_facts.length > 0 ? (
                          <details>
                            <summary className="cursor-pointer font-medium">Supporting facts</summary>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {meta.supporting_facts.map((f, idx) => (
                                <li key={`${f.source}-${idx}`}>
                                  [{f.source}] {f.fact}
                                  {f.id != null ? ` (#${f.id})` : ""}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                        {meta.limitations.length > 0 ? (
                          <div className="rounded border border-yellow-300 bg-yellow-50 p-2">
                            <p className="mb-1 font-medium text-yellow-800">Limitations</p>
                            <ul className="list-disc space-y-1 pl-4 text-yellow-900">
                              {meta.limitations.map((l, idx) => (
                                <li key={`${idx}-${l}`}>{l}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {!isUser && m.message_type === "answer" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={feedbackDisabled}
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => void handleFeedback(m, "positive")}
                        >
                          👍 Useful
                        </button>
                        <button
                          type="button"
                          disabled={feedbackDisabled}
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => void handleFeedback(m, "negative")}
                        >
                          👎 Not useful
                        </button>
                        <button
                          type="button"
                          disabled={feedbackDisabled}
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => void handleFeedback(m, "neutral")}
                        >
                          Neutral
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <div className="mt-3 space-y-2 rounded border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-700" htmlFor="chat-as-of-date">
                As of date
              </label>
              <input
                id="chat-as-of-date"
                type="date"
                className="rounded border px-2 py-1 text-sm"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                disabled={sending || selectedIsArchived}
              />
            </div>
            {selectedIsArchived ? (
              <p className="text-sm text-gray-600">
                This chat is archived. Start a new chat to ask another question.
              </p>
            ) : null}
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask a question about priorities, stock, advertising, pricing, alerts..."
                className="min-h-[88px] flex-1 rounded border px-3 py-2 text-sm"
                disabled={sending || selectedIsArchived}
              />
              <button
                type="button"
                disabled={sending || selectedIsArchived}
                className="rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => void handleAskSubmit()}
              >
                {sending ? "Thinking..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
