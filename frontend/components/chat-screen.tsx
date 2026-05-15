"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonClassNames } from "@/components/ui/button";
import {
  archiveChatSession,
  askChat,
  createChatFeedback,
  getChatMessages,
  getChatSessions,
  type AskChatResponse,
  type ChatFeedbackRating,
  type ChatMessage,
  type ChatMessageType,
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

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") return "Вы";
  if (role === "assistant") return "Ассистент";
  return "Система";
}

function looksLikeStackTraceOrNoise(text: string): boolean {
  return (
    text.length > 280 ||
    text.includes("\n\t") ||
    text.includes("goroutine") ||
    text.includes("stacktrace") ||
    text.includes("at go.") ||
    text.includes(".go:")
  );
}

/** User-facing copy for chat ask failures (no stack traces). */
function friendlyChatAskError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes("503") ||
    s.includes("502") ||
    s.includes("504") ||
    s.includes("service unavailable") ||
    s.includes("temporarily unavailable") ||
    s.includes("unavailable") ||
    s.includes("openai") ||
    s.includes("rate limit") ||
    s.includes("timeout")
  ) {
    return "ИИ временно недоступен. Проверьте настройки OpenAI или попробуйте позже.";
  }
  if (looksLikeStackTraceOrNoise(raw)) {
    return "Что-то пошло не так. Попробуйте позже.";
  }
  return raw;
}

function messageTypeBadge(type: ChatMessageType): { label: string; className: string } | null {
  if (type === "question" || type === "answer") return null;
  if (type === "error") {
    return { label: "ошибка", className: "border-red-300 bg-red-50 text-red-900" };
  }
  if (type === "meta") {
    return { label: "мета", className: "border-violet-300 bg-violet-50 text-violet-900" };
  }
  return { label: type, className: "border-gray-300 bg-gray-100 text-gray-800" };
}

function alertsDeepLink(alertId: number): string {
  return `/app/alerts?focusAlertId=${encodeURIComponent(String(alertId))}`;
}

function recommendationsDeepLink(recId: number): string {
  return `/app/recommendations?focusRecommendationId=${encodeURIComponent(String(recId))}`;
}

function translateChatSessionStatus(st: string): string {
  const m: Record<string, string> = {
    active: "Активен",
    archived: "В архиве",
  };
  return m[st] ?? st;
}

function translateMetaConfidence(level: string): string {
  const m: Record<string, string> = {
    low: "низкая",
    medium: "средняя",
    high: "высокая",
  };
  return m[level] ?? level;
}

export default function ChatScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const [feedbackRatingByMessageId, setFeedbackRatingByMessageId] = useState<
    Record<number, ChatFeedbackRating>
  >({});

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

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

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
      setSessionsError(e instanceof Error ? e.message : "Не удалось загрузить сеансы чата");
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
      setMessagesError(e instanceof Error ? e.message : "Не удалось загрузить сообщения");
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

  useEffect(() => {
    if (loadingMessages) return;
    const t = window.setTimeout(() => scrollConversationToBottom("smooth"), 50);
    return () => window.clearTimeout(t);
  }, [messages, loadingMessages, sending, scrollConversationToBottom]);

  const applyAskResponse = useCallback(
    async (response: AskChatResponse) => {
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
    },
    [loadMessages],
  );

  const sendQuestion = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || sending || selectedIsArchived) return;
      setSending(true);
      setAskError(null);
      setFeedbackError(null);
      setFeedbackMessage(null);
      try {
        const response = await askChat({
          session_id: selectedSessionId ?? undefined,
          question: q,
          as_of_date: asOfDate.trim() || undefined,
        });
        await applyAskResponse(response);
        setInputValue("");
        await loadSessions();
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : "Не удалось отправить вопрос";
        setAskError(friendlyChatAskError(raw));
      } finally {
        setSending(false);
      }
    },
    [applyAskResponse, asOfDate, loadSessions, selectedIsArchived, selectedSessionId, sending],
  );

  async function handleAskSubmit() {
    await sendQuestion(inputValue);
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
    setFeedbackRatingByMessageId({});
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
      setSessionsError(e instanceof Error ? e.message : "Не удалось архивировать сеанс");
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
      setFeedbackRatingByMessageId((prev) => ({ ...prev, [message.id]: rating }));
      setFeedbackMessage("Спасибо — отзыв сохранён.");
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Не удалось сохранить отзыв";
      setFeedbackError(looksLikeStackTraceOrNoise(raw) ? "Не удалось сохранить отзыв. Попробуйте снова." : raw);
    } finally {
      setFeedbackLoadingByMessage((prev) => ({ ...prev, [message.id]: false }));
    }
  }

  function handleSuggestedPromptClick(prompt: string) {
    if (sending || selectedIsArchived) return;
    if (!inputValue.trim()) {
      void sendQuestion(prompt);
      return;
    }
    setInputValue(prompt);
  }

  function handleSuggestedPromptSend(prompt: string) {
    void sendQuestion(prompt);
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (!sending && !selectedIsArchived) {
      void handleAskSubmit();
    }
  }

  return (
    <main className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">ИИ-чат</h1>
        <p className="mt-1 text-sm text-gray-600">
          Доступ на естественном языке к данным магазина, оповещениям и ИИ-рекомендациям.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Чаты</h2>
            <button
              type="button"
              className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
              onClick={handleNewChat}
            >
              Новый чат
            </button>
          </div>
          {loadingSessions ? <p className="text-sm">Загрузка сеансов…</p> : null}
          {sessionsError ? <p className="mb-2 text-sm text-red-700">{sessionsError}</p> : null}
          {!loadingSessions && sessions.length === 0 ? (
            <p className="text-sm text-gray-600">Чатов пока нет.</p>
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
                      <span className="rounded border px-1 py-0.5">{translateChatSessionStatus(s.status)}</span>
                      <span className="ml-2">обновлено {fmtDate(s.updated_at)}</span>
                    </div>
                  </button>
                  {s.status !== "archived" ? (
                    <button
                      type="button"
                      disabled={archivingSessionId === s.id}
                      className="mt-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => void handleArchiveSession(s.id)}
                    >
                      {archivingSessionId === s.id ? "Архивация…" : "В архив"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-h-0 flex-col rounded border">
          <div className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-3">
            <h2 className="text-lg font-semibold">Переписка</h2>
            {selectedSession ? (
              <span className="text-xs text-gray-600">
                Сеанс №{selectedSession.id}{" "}
                <span className="rounded border px-1 py-0.5">{translateChatSessionStatus(selectedSession.status)}</span>
              </span>
            ) : (
              <span className="text-xs text-gray-600">Новый сеанс будет создан при первом вопросе</span>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-b bg-amber-50/50 px-4 py-2">
            {askError ? (
              <p className="text-sm text-amber-950" role="alert">
                {askError}
              </p>
            ) : null}
            {messagesError ? <p className="text-sm text-red-800">{messagesError}</p> : null}
            {feedbackError ? <p className="text-sm text-red-800">{feedbackError}</p> : null}
            {feedbackMessage ? <p className="text-sm text-green-800">{feedbackMessage}</p> : null}
          </div>

          <div
            ref={scrollRef}
            className="min-h-[min(520px,70vh)] flex-1 space-y-3 overflow-y-auto bg-gray-100 p-4"
          >
            {loadingMessages ? (
              <p className="text-sm text-gray-600">Загрузка сообщений…</p>
            ) : messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-4 text-center text-sm text-gray-600">
                Задайте вопрос о магазине. Используйте подсказки ниже или введите свой текст.
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                const isAssistant = m.role === "assistant";
                const meta = messageMetaById[m.id];
                const typeBadge = messageTypeBadge(m.message_type);
                const feedbackDisabled = !!feedbackLoadingByMessage[m.id];
                const savedRating = feedbackRatingByMessageId[m.id];

                const bubbleBase =
                  "max-w-[min(100%,42rem)] rounded-2xl border px-4 py-3 shadow-sm";
                const bubbleUser = `${bubbleBase} ml-auto border-blue-200 bg-blue-600 text-white`;
                const bubbleAssistant = `${bubbleBase} mr-auto border-gray-200 bg-white text-gray-900`;
                const bubbleSystem = `${bubbleBase} mr-auto border-slate-300 bg-slate-50 text-slate-900`;
                const bubbleError = `${bubbleBase} mr-auto border-red-200 bg-red-50 text-red-950`;
                const bubbleMeta = `${bubbleBase} mr-auto border-violet-200 bg-violet-50 text-violet-950`;

                let bubbleClass = bubbleAssistant;
                if (isUser) bubbleClass = bubbleUser;
                else if (m.role === "system") bubbleClass = bubbleSystem;
                else if (m.message_type === "error") bubbleClass = bubbleError;
                else if (m.message_type === "meta") bubbleClass = bubbleMeta;

                return (
                  <div
                    key={m.id}
                    className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <article className={bubbleClass}>
                      <div
                        className={`mb-2 flex flex-wrap items-center gap-2 text-xs ${
                          isUser ? "text-blue-100" : "text-gray-500"
                        }`}
                      >
                        <span className={`font-semibold uppercase tracking-wide ${isUser ? "" : "text-gray-700"}`}>
                          {roleLabel(m.role)}
                        </span>
                        {typeBadge ? (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${typeBadge.className}`}
                          >
                            {typeBadge.label}
                          </span>
                        ) : null}
                        <time className={isUser ? "text-blue-100/90" : "text-gray-500"} dateTime={m.created_at}>
                          {fmtDate(m.created_at)}
                        </time>
                      </div>
                      <p
                        className={`whitespace-pre-wrap text-sm leading-relaxed ${
                          isUser ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {m.content}
                      </p>

                      {!isUser && meta ? (
                        <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50/90 p-2 text-xs text-gray-800">
                          <summary className="cursor-pointer select-none font-medium text-gray-700">
                            Детали ответа
                          </summary>
                          <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded border bg-white px-2 py-0.5">намерение: {meta.intent}</span>
                              <span className="rounded border bg-white px-2 py-0.5">
                                уверенность: {translateMetaConfidence(meta.confidence_level)}
                              </span>
                              <span className="rounded border bg-white px-2 py-0.5">трассировка №{meta.trace_id}</span>
                            </div>
                            {meta.summary ? (
                              <p>
                                <span className="font-medium text-gray-700">Кратко:</span> {meta.summary}
                              </p>
                            ) : null}

                            {meta.related_alert_ids.length > 0 ? (
                              <details>
                                <summary className="cursor-pointer font-medium text-gray-700">
                                  Связанные оповещения ({meta.related_alert_ids.length})
                                </summary>
                                <ul className="mt-1 list-none space-y-1 pl-0">
                                  {meta.related_alert_ids.map((id) => (
                                    <li key={id}>
                                      <Link
                                        href={alertsDeepLink(id)}
                                        className="text-blue-700 underline hover:text-blue-900"
                                      >
                                        Оповещение №{id}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}

                            {meta.related_recommendation_ids.length > 0 ? (
                              <details>
                                <summary className="cursor-pointer font-medium text-gray-700">
                                  Связанные рекомендации ({meta.related_recommendation_ids.length})
                                </summary>
                                <ul className="mt-1 list-none space-y-1 pl-0">
                                  {meta.related_recommendation_ids.map((id) => (
                                    <li key={id}>
                                      <Link
                                        href={recommendationsDeepLink(id)}
                                        className="text-blue-700 underline hover:text-blue-900"
                                      >
                                        Рекомендация №{id}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}

                            {meta.supporting_facts.length > 0 ? (
                              <details>
                                <summary className="cursor-pointer font-medium text-gray-700">
                                  Опорные факты ({meta.supporting_facts.length})
                                </summary>
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
                              <details>
                                <summary className="cursor-pointer font-medium text-amber-900">
                                  Ограничения ({meta.limitations.length})
                                </summary>
                                <ul className="mt-1 list-disc space-y-1 border-l-2 border-amber-300 pl-4 text-amber-950">
                                  {meta.limitations.map((l, idx) => (
                                    <li key={`${idx}-${l}`}>{l}</li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}
                          </div>
                        </details>
                      ) : null}

                      {isAssistant && m.message_type === "answer" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                          <span className="text-xs text-gray-500">Это было полезно?</span>
                          {(["positive", "negative", "neutral"] as const).map((rating) => {
                            const active = savedRating === rating;
                            const label =
                              rating === "positive"
                                ? "👍 Полезно"
                                : rating === "negative"
                                  ? "👎 Не помогло"
                                  : "😐 Нейтрально";
                            return (
                              <button
                                key={rating}
                                type="button"
                                disabled={feedbackDisabled}
                                title={rating}
                                className={[
                                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                                  active
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
                                ].join(" ")}
                                onClick={() => void handleFeedback(m, rating)}
                              >
                                {label}
                                {active ? " · сохранено" : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  </div>
                );
              })
            )}

            {sending ? (
              <div className="flex justify-start">
                <div className="max-w-[min(100%,42rem)] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Ассистент</div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-2 w-2 animate-pulse rounded-full bg-blue-500"
                      aria-hidden
                    />
                    <span>ИИ готовит ответ…</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 space-y-3 border-t bg-white p-4">
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">Подсказки</p>
              <p className="mb-2 text-[11px] text-gray-500">
                Нажмите, чтобы подставить текст в поле (или отправить сразу, если поле пустое). Кнопка «Отправить» в
                строке отправляет этот текст напрямую.
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <div
                    key={prompt}
                    className="flex flex-wrap items-stretch gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2"
                  >
                    <button
                      type="button"
                      disabled={sending || selectedIsArchived}
                      className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 disabled:opacity-50"
                      onClick={() => handleSuggestedPromptClick(prompt)}
                    >
                      {prompt}
                    </button>
                    <button
                      type="button"
                      disabled={sending || selectedIsArchived}
                      className={`shrink-0 self-center ${buttonClassNames("primary")}`}
                      onClick={() => handleSuggestedPromptSend(prompt)}
                    >
                      Отправить
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-700" htmlFor="chat-as-of-date">
                  Дата отчёта
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
                  Этот чат в архиве. Начните новый чат, чтобы задать ещё вопрос.
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Задайте вопрос… (Enter — отправить, Shift+Enter — новая строка)"
                  className="min-h-[96px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-inner disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={sending || selectedIsArchived}
                  aria-busy={sending}
                />
                <button
                  type="button"
                  disabled={sending || selectedIsArchived || !inputValue.trim()}
                  className={`h-11 shrink-0 sm:h-auto sm:min-h-[96px] sm:px-6 ${buttonClassNames("primary")}`}
                  onClick={() => void handleAskSubmit()}
                >
                  {sending ? "Отправка…" : "Отправить"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
