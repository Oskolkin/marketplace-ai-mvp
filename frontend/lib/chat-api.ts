import { apiGet, apiPost } from "@/lib/api";

export type ChatSessionStatus = "active" | "archived";
export type ChatMessageRole = "user" | "assistant" | "system";
export type ChatMessageType = "question" | "answer" | "error" | "meta";
export type ChatConfidenceLevel = "low" | "medium" | "high";
export type ChatIntent =
  | "priorities"
  | "explain_recommendation"
  | "unsafe_ads"
  | "ad_loss"
  | "sales"
  | "stock"
  | "advertising"
  | "pricing"
  | "alerts"
  | "recommendations"
  | "abc_analysis"
  | "general_overview"
  | "unknown"
  | "unsupported";
export type ChatFeedbackRating = "positive" | "negative" | "neutral";

export interface ChatSession {
  id: number;
  title: string;
  status: ChatSessionStatus;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: ChatMessageRole;
  message_type: ChatMessageType;
  content: string;
  created_at: string;
}

export interface SupportingFact {
  source: string;
  id?: number | null;
  fact: string;
}

export interface AskChatRequest {
  session_id?: number;
  question: string;
  as_of_date?: string;
}

export interface AskChatResponse {
  session_id: number;
  user_message_id: number;
  assistant_message_id?: number | null;
  trace_id: number;
  answer: string;
  summary: string;
  intent: ChatIntent;
  confidence_level: ChatConfidenceLevel;
  related_alert_ids: number[];
  related_recommendation_ids: number[];
  supporting_facts: SupportingFact[];
  limitations: string[];
}

export interface ListChatSessionsResponse {
  items: ChatSession[];
  limit: number;
  offset: number;
}

export interface ListChatMessagesResponse {
  items: ChatMessage[];
  limit: number;
  offset: number;
}

export interface ChatFeedback {
  id: number;
  session_id: number;
  message_id: number;
  rating: ChatFeedbackRating;
  comment?: string | null;
  created_at: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    query.set(k, String(v));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export async function askChat(payload: AskChatRequest): Promise<AskChatResponse> {
  return apiPost<AskChatResponse>("/api/v1/chat/ask", payload);
}

export async function getChatSessions(params?: {
  limit?: number;
  offset?: number;
}): Promise<ListChatSessionsResponse> {
  const query = buildQuery({
    limit: params?.limit,
    offset: params?.offset,
  });
  return apiGet<ListChatSessionsResponse>(`/api/v1/chat/sessions${query}`);
}

export async function getChatSession(id: number): Promise<ChatSession> {
  return apiGet<ChatSession>(`/api/v1/chat/sessions/${id}`);
}

export async function getChatMessages(
  sessionId: number,
  params?: { limit?: number; offset?: number },
): Promise<ListChatMessagesResponse> {
  const query = buildQuery({
    limit: params?.limit,
    offset: params?.offset,
  });
  return apiGet<ListChatMessagesResponse>(
    `/api/v1/chat/sessions/${sessionId}/messages${query}`,
  );
}

export async function archiveChatSession(id: number): Promise<ChatSession> {
  return apiPost<ChatSession>(`/api/v1/chat/sessions/${id}/archive`);
}

export async function createChatFeedback(
  messageId: number,
  payload: { session_id: number; rating: ChatFeedbackRating; comment?: string },
): Promise<ChatFeedback> {
  return apiPost<ChatFeedback>(`/api/v1/chat/messages/${messageId}/feedback`, payload);
}
