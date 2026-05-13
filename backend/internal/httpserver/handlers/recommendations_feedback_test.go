package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/recommendations"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func TestRecommendationsHandlerAddFeedback(t *testing.T) {
	handler := NewRecommendationsHandler(recommendations.NewService(
		&mockRecommendationsRepo{},
		nil,
		nil,
		nil,
		recommendations.ServiceConfig{},
	))

	makeReq := func(body string, id string) *http.Request {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/recommendations/"+id+"/feedback", strings.NewReader(body))
		ctx := auth.WithAuthContext(req.Context(), dbgen.User{ID: 1, Email: "u@x.y"}, dbgen.SellerAccount{ID: 7})
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", id)
		return req.WithContext(context.WithValue(ctx, chi.RouteCtxKey, rctx))
	}

	t.Run("success", func(t *testing.T) {
		rr := httptest.NewRecorder()
		handler.AddFeedback(rr, makeReq(`{"rating":"positive","comment":"ok"}`, "1"))
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
	})

	t.Run("invalid rating", func(t *testing.T) {
		rr := httptest.NewRecorder()
		handler.AddFeedback(rr, makeReq(`{"rating":"wrong"}`, "1"))
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
	})

	t.Run("not found", func(t *testing.T) {
		svc := recommendations.NewService(&mockRecommendationsRepo{getErr: pgx.ErrNoRows}, nil, nil, nil, recommendations.ServiceConfig{})
		h := NewRecommendationsHandler(svc)
		rr := httptest.NewRecorder()
		h.AddFeedback(rr, makeReq(`{"rating":"positive"}`, "1"))
		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
	})
}

type mockRecommendationsRepo struct {
	getErr error
}

func (m *mockRecommendationsRepo) CreateRun(context.Context, recommendations.CreateRecommendationRunInput) (int64, error) {
	return 0, nil
}
func (m *mockRecommendationsRepo) CompleteRun(context.Context, recommendations.CompleteRecommendationRunInput) error {
	return nil
}
func (m *mockRecommendationsRepo) FailRun(context.Context, int64, int64, string) error { return nil }
func (m *mockRecommendationsRepo) UpsertRecommendation(context.Context, recommendations.UpsertRecommendationInput) (int64, error) {
	return 0, nil
}
func (m *mockRecommendationsRepo) DeleteRecommendationAlertLinks(context.Context, int64, int64) error {
	return nil
}
func (m *mockRecommendationsRepo) LinkRecommendationAlert(context.Context, int64, int64, int64) error {
	return nil
}
func (m *mockRecommendationsRepo) ListRecommendationsFiltered(context.Context, int64, recommendations.ListFilter) ([]recommendations.Recommendation, error) {
	return nil, nil
}
func (m *mockRecommendationsRepo) GetRecommendationByID(context.Context, int64, int64) (recommendations.Recommendation, error) {
	if m.getErr != nil {
		return recommendations.Recommendation{}, m.getErr
	}
	return recommendations.Recommendation{ID: 1}, nil
}
func (m *mockRecommendationsRepo) ListAlertsByRecommendationID(context.Context, int64, int64) ([]recommendations.RelatedAlert, error) {
	return nil, nil
}
func (m *mockRecommendationsRepo) AcceptRecommendation(context.Context, int64, int64) (recommendations.Recommendation, error) {
	return recommendations.Recommendation{}, nil
}
func (m *mockRecommendationsRepo) DismissRecommendation(context.Context, int64, int64) (recommendations.Recommendation, error) {
	return recommendations.Recommendation{}, nil
}
func (m *mockRecommendationsRepo) ResolveRecommendation(context.Context, int64, int64) (recommendations.Recommendation, error) {
	return recommendations.Recommendation{}, nil
}
func (m *mockRecommendationsRepo) CountOpenRecommendations(context.Context, int64) (int64, error) {
	return 0, nil
}
func (m *mockRecommendationsRepo) CountOpenRecommendationsByPriority(context.Context, int64) ([]recommendations.NamedCount, error) {
	return nil, nil
}
func (m *mockRecommendationsRepo) CountOpenRecommendationsByConfidence(context.Context, int64) ([]recommendations.NamedCount, error) {
	return nil, nil
}
func (m *mockRecommendationsRepo) GetLatestRecommendationRun(context.Context, int64) (*recommendations.RunInfo, error) {
	return nil, nil
}
func (m *mockRecommendationsRepo) CreateFeedback(ctx context.Context, input recommendations.AddRecommendationFeedbackInput) (*recommendations.RecommendationFeedback, error) {
	return &recommendations.RecommendationFeedback{
		ID:               1,
		RecommendationID: input.RecommendationID,
		SellerAccountID:  input.SellerAccountID,
		Rating:           input.Rating,
		Comment:          input.Comment,
		CreatedAt:        time.Now().UTC(),
	}, nil
}
