package admin

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (s *Service) GetAIRecommendationLogs(ctx context.Context, sellerAccountID int64, filter RecommendationRunLogFilter) (*RecommendationRunLogListResult, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return &RecommendationRunLogListResult{}, err
	}
	page := NormalizePage(filter.Limit, filter.Offset, 50, 200)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.RunType = strings.TrimSpace(filter.RunType)
	items, err := s.repo.ListRecommendationRuns(ctx, sellerAccountID, filter, page)
	if err != nil {
		return nil, err
	}
	return &RecommendationRunLogListResult{
		Items:  items,
		Limit:  page.Limit,
		Offset: page.Offset,
	}, nil
}

func (s *Service) GetRecommendationRunDetail(ctx context.Context, sellerAccountID, runID int64) (*RecommendationRunDetail, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	if runID <= 0 {
		return nil, ErrAdminDataUnavailable
	}
	detail, err := s.repo.GetRecommendationRunDetail(ctx, sellerAccountID, runID)
	if err != nil {
		return nil, err
	}
	if len(detail.Diagnostics) == 0 {
		detail.Limitations = append(detail.Limitations, "Rejected item payloads are unavailable for historical runs.")
	}
	if len(detail.Recommendations) == 0 {
		detail.Limitations = append(detail.Limitations, "Recommendations cannot be reliably linked to a specific run with current schema.")
	}
	return detail, nil
}

func (s *Service) GetRecommendationRawAI(ctx context.Context, sellerAccountID, recommendationID int64) (*RecommendationRawAI, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	if recommendationID <= 0 {
		return nil, ErrAdminDataUnavailable
	}
	return s.repo.GetRecommendationRawAI(ctx, sellerAccountID, recommendationID)
}

func (s *Service) GetAIChatLogs(ctx context.Context, sellerAccountID int64, filter ChatTraceFilter) (*ChatTraceListResult, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Intent = strings.TrimSpace(filter.Intent)
	page := NormalizePage(filter.Limit, filter.Offset, 50, 200)
	items, err := s.repo.ListChatTraces(ctx, sellerAccountID, filter, page)
	if err != nil {
		return nil, err
	}
	return &ChatTraceListResult{
		Items:  items,
		Limit:  page.Limit,
		Offset: page.Offset,
	}, nil
}

func (s *Service) GetChatTraceDetail(ctx context.Context, sellerAccountID, traceID int64) (*ChatTraceDetail, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	if traceID <= 0 {
		return nil, ErrAdminDataUnavailable
	}
	return s.repo.GetChatTraceDetail(ctx, sellerAccountID, traceID)
}

func (s *Service) ListChatSessions(ctx context.Context, sellerAccountID int64, filter ChatSessionFilter) (*ChatSessionListResult, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	filter.Status = strings.TrimSpace(filter.Status)
	page := NormalizePage(filter.Limit, filter.Offset, 50, 200)
	items, err := s.repo.ListChatSessions(ctx, sellerAccountID, filter, page)
	if err != nil {
		return nil, err
	}
	return &ChatSessionListResult{
		Items:  items,
		Limit:  page.Limit,
		Offset: page.Offset,
	}, nil
}

func (s *Service) ListChatMessages(ctx context.Context, sellerAccountID, sessionID int64, filter ChatMessageFilter) (*ChatMessageListResult, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	if sessionID <= 0 {
		return nil, ErrAdminDataUnavailable
	}
	session, err := s.repo.GetChatSession(ctx, sellerAccountID, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, pgx.ErrNoRows
	}
	page := NormalizePage(filter.Limit, filter.Offset, 50, 200)
	items, err := s.repo.ListChatMessages(ctx, sellerAccountID, sessionID, filter, page)
	if err != nil {
		return nil, err
	}
	return &ChatMessageListResult{
		Items:  items,
		Limit:  page.Limit,
		Offset: page.Offset,
	}, nil
}

func (s *Service) ListChatFeedback(ctx context.Context, filter ChatFeedbackFilter) (*ChatFeedbackListResult, error) {
	if filter.SellerAccountID != nil {
		if err := validateSellerAccountID(*filter.SellerAccountID); err != nil {
			return nil, err
		}
	}
	filter.Rating = strings.TrimSpace(filter.Rating)
	page := NormalizePage(filter.Limit, filter.Offset, 50, 200)
	items, err := s.repo.ListChatFeedback(ctx, filter, page)
	if err != nil {
		return nil, err
	}
	return &ChatFeedbackListResult{Items: items, Limit: page.Limit, Offset: page.Offset}, nil
}

func (s *Service) ListRecommendationFeedback(ctx context.Context, sellerAccountID int64, filter RecommendationFeedbackFilter) (*RecommendationFeedbackListResult, error) {
	if err := validateSellerAccountID(sellerAccountID); err != nil {
		return nil, err
	}
	filter.Rating = strings.TrimSpace(filter.Rating)
	filter.Status = strings.TrimSpace(filter.Status)
	page := NormalizePage(filter.Limit, filter.Offset, 50, 200)
	items, err := s.repo.ListRecommendationFeedback(ctx, sellerAccountID, filter, page)
	if err != nil {
		return nil, err
	}
	counts, err := s.repo.GetRecommendationProxyFeedbackCounts(ctx, sellerAccountID)
	if err != nil {
		return nil, err
	}
	return &RecommendationFeedbackListResult{
		Items:               items,
		ProxyStatusFeedback: counts,
		Limitations:         []string{"Historical recommendation feedback is represented by recommendation statuses accepted/dismissed/resolved."},
		Limit:               page.Limit,
		Offset:              page.Offset,
	}, nil
}
