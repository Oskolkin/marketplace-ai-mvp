package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/chat"
	"github.com/getsentry/sentry-go"
	"github.com/go-chi/chi/v5"
)

type ChatHandler struct {
	service *chat.Service
}

func NewChatHandler(service *chat.Service) *ChatHandler {
	return &ChatHandler{service: service}
}

type askChatRequest struct {
	SessionID *int64  `json:"session_id"`
	Question  string  `json:"question"`
	AsOfDate  *string `json:"as_of_date,omitempty"`
}

type askChatResponse struct {
	SessionID                int64                    `json:"session_id"`
	UserMessageID            int64                    `json:"user_message_id"`
	AssistantMessageID       *int64                   `json:"assistant_message_id"`
	TraceID                  int64                    `json:"trace_id"`
	Answer                   string                   `json:"answer"`
	Summary                  string                   `json:"summary"`
	Intent                   chat.ChatIntent          `json:"intent"`
	ConfidenceLevel          chat.ConfidenceLevel     `json:"confidence_level"`
	RelatedAlertIDs          []int64                  `json:"related_alert_ids"`
	RelatedRecommendationIDs []int64                  `json:"related_recommendation_ids"`
	SupportingFacts          []supportingFactResponse `json:"supporting_facts"`
	Limitations              []string                 `json:"limitations"`
}

type supportingFactResponse struct {
	Source string `json:"source"`
	ID     *int64 `json:"id,omitempty"`
	Fact   string `json:"fact"`
}

type chatSessionResponse struct {
	ID            int64                  `json:"id"`
	Title         string                 `json:"title"`
	Status        chat.ChatSessionStatus `json:"status"`
	CreatedAt     string                 `json:"created_at"`
	UpdatedAt     string                 `json:"updated_at"`
	LastMessageAt *string                `json:"last_message_at"`
}

type chatMessageResponse struct {
	ID          int64                `json:"id"`
	SessionID   int64                `json:"session_id"`
	Role        chat.ChatMessageRole `json:"role"`
	MessageType chat.ChatMessageType `json:"message_type"`
	Content     string               `json:"content"`
	CreatedAt   string               `json:"created_at"`
}

type chatFeedbackRequest struct {
	SessionID int64   `json:"session_id"`
	Rating    string  `json:"rating"`
	Comment   *string `json:"comment,omitempty"`
}

type chatFeedbackResponse struct {
	ID        int64                   `json:"id"`
	SessionID int64                   `json:"session_id"`
	MessageID int64                   `json:"message_id"`
	Rating    chat.ChatFeedbackRating `json:"rating"`
	Comment   *string                 `json:"comment"`
	CreatedAt string                  `json:"created_at"`
}

func (h *ChatHandler) Ask(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	user, userOk := auth.UserFromContext(r.Context())
	var userID *int64
	if userOk {
		userID = &user.ID
	}

	var req askChatRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	question := strings.TrimSpace(req.Question)
	if question == "" {
		writeJSONError(w, http.StatusBadRequest, "question is required")
		return
	}
	if req.SessionID != nil && *req.SessionID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "session_id must be > 0")
		return
	}
	var asOfDate *time.Time
	if req.AsOfDate != nil && strings.TrimSpace(*req.AsOfDate) != "" {
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(*req.AsOfDate))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid as_of_date, expected YYYY-MM-DD")
			return
		}
		asOfDate = &parsed
	}

	result, err := h.service.Ask(r.Context(), chat.AskInput{
		SellerAccountID: sellerAccount.ID,
		UserID:          userID,
		SessionID:       req.SessionID,
		Question:        question,
		AsOfDate:        asOfDate,
	})
	if err != nil {
		if errors.Is(err, chat.ErrQuestionRequired) {
			writeJSONError(w, http.StatusBadRequest, "question is required")
			return
		}
		if errors.Is(err, chat.ErrAITemporarilyUnavailable) {
			slog.Error("chat ask openai unavailable", "err", err)
			sentry.CaptureException(err)
			writeJSONError(w, http.StatusServiceUnavailable, "AI temporarily unavailable, try again later")
			return
		}
		if errors.Is(err, chat.ErrOpenAIRequestTooLarge) {
			writeJSONError(w, http.StatusBadRequest, "request too large for AI context budget")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to process chat ask")
		return
	}
	if result == nil || result.Answer == nil {
		writeJSONError(w, http.StatusInternalServerError, "chat answer was not produced")
		return
	}
	writeJSON(w, http.StatusOK, askChatResponse{
		SessionID:                result.SessionID,
		UserMessageID:            result.UserMessageID,
		AssistantMessageID:       result.AssistantMessageID,
		TraceID:                  result.TraceID,
		Answer:                   result.Answer.Answer,
		Summary:                  result.Answer.Summary,
		Intent:                   result.Answer.Intent,
		ConfidenceLevel:          result.Answer.ConfidenceLevel,
		RelatedAlertIDs:          result.Answer.RelatedAlertIDs,
		RelatedRecommendationIDs: result.Answer.RelatedRecommendationIDs,
		SupportingFacts:          mapSupportingFacts(result.Answer.SupportingFacts),
		Limitations:              result.Answer.Limitations,
	})
}

func (h *ChatHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, offset := parseChatPagination(r, 20, 100)
	items, err := h.service.ListSessions(r.Context(), sellerAccount.ID, int32(limit), int32(offset))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list chat sessions")
		return
	}
	resp := make([]chatSessionResponse, 0, len(items))
	for _, item := range items {
		resp = append(resp, mapChatSession(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  resp,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *ChatHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID, err := parseChatIDParam(r, "id")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	session, err := h.service.GetSession(r.Context(), sellerAccount.ID, sessionID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to get chat session")
		return
	}
	if session == nil {
		writeJSONError(w, http.StatusNotFound, "chat session not found")
		return
	}
	writeJSON(w, http.StatusOK, mapChatSession(*session))
}

func (h *ChatHandler) ListSessionMessages(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID, err := parseChatIDParam(r, "id")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	session, err := h.service.GetSession(r.Context(), sellerAccount.ID, sessionID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to get chat session")
		return
	}
	if session == nil {
		writeJSONError(w, http.StatusNotFound, "chat session not found")
		return
	}
	limit, offset := parseChatPagination(r, 50, 200)
	items, err := h.service.ListMessages(r.Context(), sellerAccount.ID, sessionID, int32(limit), int32(offset))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list chat messages")
		return
	}
	resp := make([]chatMessageResponse, 0, len(items))
	for _, item := range items {
		resp = append(resp, mapChatMessage(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  resp,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *ChatHandler) ArchiveSession(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID, err := parseChatIDParam(r, "id")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	session, err := h.service.ArchiveSession(r.Context(), sellerAccount.ID, sessionID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to archive chat session")
		return
	}
	if session == nil {
		writeJSONError(w, http.StatusNotFound, "chat session not found")
		return
	}
	writeJSON(w, http.StatusOK, mapChatSession(*session))
}

func (h *ChatHandler) AddMessageFeedback(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	messageID, err := parseChatIDParam(r, "id")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid message id")
		return
	}
	var req chatFeedbackRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	if req.SessionID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "session_id must be > 0")
		return
	}
	rating := chat.ChatFeedbackRating(strings.TrimSpace(req.Rating))
	switch rating {
	case chat.ChatFeedbackRatingPositive, chat.ChatFeedbackRatingNegative, chat.ChatFeedbackRatingNeutral:
	default:
		writeJSONError(w, http.StatusBadRequest, "invalid rating")
		return
	}

	item, err := h.service.AddFeedback(r.Context(), chat.AddFeedbackInput{
		SellerAccountID: sellerAccount.ID,
		SessionID:       req.SessionID,
		MessageID:       messageID,
		Rating:          rating,
		Comment:         req.Comment,
	})
	if err != nil {
		errLower := strings.ToLower(err.Error())
		switch {
		case strings.Contains(errLower, "message not found"):
			writeJSONError(w, http.StatusNotFound, "chat message not found")
		case strings.Contains(errLower, "feedback is allowed only for assistant answer messages"),
			strings.Contains(errLower, "message does not belong to session"),
			strings.Contains(errLower, "invalid feedback rating"):
			writeJSONError(w, http.StatusBadRequest, err.Error())
		default:
			writeJSONError(w, http.StatusInternalServerError, "failed to add chat feedback")
		}
		return
	}
	writeJSON(w, http.StatusOK, chatFeedbackResponse{
		ID:        item.ID,
		SessionID: item.SessionID,
		MessageID: item.MessageID,
		Rating:    item.Rating,
		Comment:   item.Comment,
		CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339),
	})
}

func parseChatIDParam(r *http.Request, name string) (int64, error) {
	raw := strings.TrimSpace(chi.URLParam(r, name))
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func parseChatPagination(r *http.Request, defaultLimit int, maxLimit int) (int, int) {
	limit := defaultLimit
	offset := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			if parsed > maxLimit {
				parsed = maxLimit
			}
			limit = parsed
		}
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	return limit, offset
}

func mapSupportingFacts(items []chat.SupportingFact) []supportingFactResponse {
	out := make([]supportingFactResponse, 0, len(items))
	for _, item := range items {
		out = append(out, supportingFactResponse{
			Source: item.Source,
			ID:     item.ID,
			Fact:   item.Fact,
		})
	}
	return out
}

func mapChatSession(item chat.ChatSession) chatSessionResponse {
	return chatSessionResponse{
		ID:            item.ID,
		Title:         item.Title,
		Status:        item.Status,
		CreatedAt:     item.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:     item.UpdatedAt.UTC().Format(time.RFC3339),
		LastMessageAt: timePtrRFC3339(item.LastMessageAt),
	}
}

func mapChatMessage(item chat.ChatMessage) chatMessageResponse {
	return chatMessageResponse{
		ID:          item.ID,
		SessionID:   item.SessionID,
		Role:        item.Role,
		MessageType: item.MessageType,
		Content:     item.Content,
		CreatedAt:   item.CreatedAt.UTC().Format(time.RFC3339),
	}
}
