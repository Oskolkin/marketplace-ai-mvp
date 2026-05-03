package recommendations

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type mockServiceRepo struct {
	runID int64
	createErr error
	completeErr error
	failErr error
	upsertErr error
	linkErr error
	created bool
	completed bool
	failed bool
	upserts int
	deletes int
	links int
	lastRunType string
	lastRaw json.RawMessage
}

func (m *mockServiceRepo) CreateRun(ctx context.Context, input CreateRecommendationRunInput) (int64, error) {
	if m.createErr != nil {
		return 0, m.createErr
	}
	m.created = true
	m.lastRunType = input.RunType
	if m.runID == 0 {
		m.runID = 11
	}
	return m.runID, nil
}
func (m *mockServiceRepo) CompleteRun(ctx context.Context, input CompleteRecommendationRunInput) error {
	if m.completeErr != nil {
		return m.completeErr
	}
	m.completed = true
	return nil
}
func (m *mockServiceRepo) FailRun(ctx context.Context, sellerAccountID int64, runID int64, errorMessage string) error {
	if m.failErr != nil {
		return m.failErr
	}
	m.failed = true
	return nil
}
func (m *mockServiceRepo) UpsertRecommendation(ctx context.Context, input UpsertRecommendationInput) (int64, error) {
	if m.upsertErr != nil {
		return 0, m.upsertErr
	}
	m.upserts++
	m.lastRaw = input.RawAIResponse
	return int64(100 + m.upserts), nil
}
func (m *mockServiceRepo) DeleteRecommendationAlertLinks(ctx context.Context, sellerAccountID int64, recommendationID int64) error {
	m.deletes++
	return nil
}
func (m *mockServiceRepo) LinkRecommendationAlert(ctx context.Context, sellerAccountID int64, recommendationID int64, alertID int64) error {
	if m.linkErr != nil {
		return m.linkErr
	}
	m.links++
	return nil
}
func (m *mockServiceRepo) ListRecommendationsFiltered(ctx context.Context, sellerAccountID int64, filter ListFilter) ([]Recommendation, error) {
	return nil, nil
}
func (m *mockServiceRepo) GetRecommendationByID(ctx context.Context, sellerAccountID int64, recommendationID int64) (Recommendation, error) {
	return Recommendation{ID: recommendationID, Title: "rec"}, nil
}
func (m *mockServiceRepo) ListAlertsByRecommendationID(ctx context.Context, sellerAccountID int64, recommendationID int64) ([]RelatedAlert, error) {
	return []RelatedAlert{{ID: 1, AlertType: "stock_oos_risk", EvidencePayload: map[string]any{"k":"v"}}}, nil
}
func (m *mockServiceRepo) AcceptRecommendation(ctx context.Context, sellerAccountID int64, recommendationID int64) (Recommendation, error) {
	return Recommendation{}, nil
}
func (m *mockServiceRepo) DismissRecommendation(ctx context.Context, sellerAccountID int64, recommendationID int64) (Recommendation, error) {
	return Recommendation{}, nil
}
func (m *mockServiceRepo) ResolveRecommendation(ctx context.Context, sellerAccountID int64, recommendationID int64) (Recommendation, error) {
	return Recommendation{}, nil
}
func (m *mockServiceRepo) CountOpenRecommendations(ctx context.Context, sellerAccountID int64) (int64, error) {
	return 0, nil
}
func (m *mockServiceRepo) CountOpenRecommendationsByPriority(ctx context.Context, sellerAccountID int64) ([]NamedCount, error) {
	return nil, nil
}
func (m *mockServiceRepo) CountOpenRecommendationsByConfidence(ctx context.Context, sellerAccountID int64) ([]NamedCount, error) {
	return nil, nil
}
func (m *mockServiceRepo) GetLatestRecommendationRun(ctx context.Context, sellerAccountID int64) (*RunInfo, error) {
	return nil, nil
}

type mockBuilder struct {
	ctx *AIRecommendationContext
	err error
}
func (m mockBuilder) BuildForAccount(ctx context.Context, sellerAccountID int64, asOfDate time.Time) (*AIRecommendationContext, error) {
	if m.err != nil { return nil, m.err }
	return m.ctx, nil
}

type mockAIClient struct {
	out *GenerateRecommendationsOutput
	err error
}
func (m mockAIClient) GenerateRecommendations(ctx context.Context, input GenerateRecommendationsInput) (*GenerateRecommendationsOutput, error) {
	if m.err != nil { return nil, m.err }
	return m.out, nil
}

type mockValidator struct {
	res *ValidationResult
	err error
}
func (m mockValidator) Validate(output *GenerateRecommendationsOutput, ctx *AIRecommendationContext) (*ValidationResult, error) {
	if m.err != nil { return nil, m.err }
	return m.res, nil
}

func TestServiceGenerateForAccount_Success(t *testing.T) {
	repo := &mockServiceRepo{}
	builder := mockBuilder{ctx: &AIRecommendationContext{
		Alerts: AlertsContext{TopOpen: []AlertSignal{{ID: 10}}},
	}}
	raw := json.RawMessage(`{"id":"resp"}`)
	client := mockAIClient{out: &GenerateRecommendationsOutput{
		Model: "gpt-test", RawResponse: raw, InputTokens: 12, OutputTokens: 8, TotalTokens: 20,
	}}
	validator := mockValidator{res: &ValidationResult{
		TotalRecommendations: 2,
		ValidRecommendations: []ValidatedRecommendation{
			{
				Recommendation: AIRecommendationCandidate{
					RecommendationType: "replenish_sku",
					Horizon: "short_term",
					EntityType: "sku",
					Title: "restock",
					WhatHappened: "w",
					WhyItMatters: "y",
					RecommendedAction: "a",
					PriorityScore: 50,
					PriorityLevel: "high",
					Urgency: "high",
					ConfidenceLevel: "high",
					SupportingMetrics: map[string]any{"x":1},
					Constraints: map[string]any{"stock_checked":true},
					SupportingAlertIDs: []int64{10},
				},
				Warnings: []string{"warn"},
				FinalConfidenceLevel: "medium",
			},
		},
		RejectedRecommendations: []RejectedRecommendation{{Index:1,Reason:"bad"}},
	}}
	svc := NewService(repo, builder, client, validator, ServiceConfig{
		Model: "gpt-5.4", PromptVersion: "v1",
	})
	sum, err := svc.GenerateForAccount(context.Background(), 77, time.Date(2026,4,30,12,0,0,0,time.UTC))
	if err != nil {
		t.Fatalf("GenerateForAccount returned error: %v", err)
	}
	if !repo.created || !repo.completed || repo.failed {
		t.Fatalf("unexpected run lifecycle: %+v", repo)
	}
	if repo.upserts != 1 || repo.links != 1 {
		t.Fatalf("expected 1 upsert and 1 link, got upserts=%d links=%d", repo.upserts, repo.links)
	}
	if repo.deletes != 1 {
		t.Fatalf("expected 1 delete old links call, got %d", repo.deletes)
	}
	if sum.ValidTotal != 1 || sum.RejectedTotal != 1 || sum.WarningsTotal != 1 || sum.TotalTokens != 20 {
		t.Fatalf("unexpected summary: %+v", sum)
	}
}

func TestServiceGenerateForAccount_FailsRunOnBuildError(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(
		repo,
		mockBuilder{err: errors.New("ctx failed")},
		mockAIClient{out: &GenerateRecommendationsOutput{}},
		mockValidator{res: &ValidationResult{}},
		ServiceConfig{},
	)
	_, err := svc.GenerateForAccount(context.Background(), 1, time.Now().UTC())
	if err == nil {
		t.Fatalf("expected error")
	}
	if !repo.failed {
		t.Fatalf("expected run to be marked failed")
	}
}

func TestServiceGenerateForAccountWithType_UsesRunType(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(repo, mockBuilder{ctx: &AIRecommendationContext{}}, mockAIClient{out: &GenerateRecommendationsOutput{}}, mockValidator{res: &ValidationResult{}}, ServiceConfig{RunType: "scheduled"})
	_, _ = svc.GenerateForAccountWithType(context.Background(), 1, time.Now().UTC(), "post_alerts")
	if repo.lastRunType != "post_alerts" {
		t.Fatalf("expected run type post_alerts, got %s", repo.lastRunType)
	}
}

func TestServiceGenerateForAccount_FailRunOnOpenAIError(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(repo, mockBuilder{ctx: &AIRecommendationContext{}}, mockAIClient{err: errors.New("openai down")}, mockValidator{res: &ValidationResult{}}, ServiceConfig{})
	_, err := svc.GenerateForAccount(context.Background(), 1, time.Now().UTC())
	if err == nil || !repo.failed {
		t.Fatalf("expected fail run on openai error")
	}
}

func TestServiceGenerateForAccount_FailRunOnValidatorError(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(repo, mockBuilder{ctx: &AIRecommendationContext{}}, mockAIClient{out: &GenerateRecommendationsOutput{}}, mockValidator{err: errors.New("bad json")}, ServiceConfig{})
	_, err := svc.GenerateForAccount(context.Background(), 1, time.Now().UTC())
	if err == nil || !repo.failed {
		t.Fatalf("expected fail run on validator error")
	}
}

func TestServiceGenerateForAccount_AllRejected(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(repo, mockBuilder{ctx: &AIRecommendationContext{}}, mockAIClient{out: &GenerateRecommendationsOutput{}}, mockValidator{res: &ValidationResult{
		TotalRecommendations: 2,
		RejectedRecommendations: []RejectedRecommendation{{Index:0,Reason:"x"},{Index:1,Reason:"y"}},
	}}, ServiceConfig{})
	sum, err := svc.GenerateForAccount(context.Background(), 1, time.Now().UTC())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.completed || repo.upserts != 0 || sum.ValidTotal != 0 || sum.RejectedTotal != 2 {
		t.Fatalf("unexpected result for all rejected: %+v repo=%+v", sum, repo)
	}
}

func TestServiceGenerateForAccount_FailRunOnDBSaveError(t *testing.T) {
	repo := &mockServiceRepo{upsertErr: errors.New("db down")}
	svc := NewService(repo, mockBuilder{ctx: &AIRecommendationContext{}}, mockAIClient{out: &GenerateRecommendationsOutput{}}, mockValidator{res: &ValidationResult{
		TotalRecommendations: 1,
		ValidRecommendations: []ValidatedRecommendation{{Recommendation: AIRecommendationCandidate{
			RecommendationType: "replenish_sku",
			Horizon: "short_term",
			EntityType: "sku",
			Title: "t",
			WhatHappened: "w",
			WhyItMatters: "y",
			RecommendedAction: "a",
			PriorityScore: 10,
			PriorityLevel: "low",
			Urgency: "low",
			ConfidenceLevel: "low",
			SupportingMetrics: map[string]any{"x":1},
			Constraints: map[string]any{"stock_checked":true},
		}}},
	}}, ServiceConfig{})
	_, err := svc.GenerateForAccount(context.Background(), 1, time.Now().UTC())
	if err == nil || !repo.failed {
		t.Fatalf("expected fail run on db save error")
	}
}

func TestServiceGenerateForAccount_SanitizesRawAIResponse(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(repo, mockBuilder{ctx: &AIRecommendationContext{}}, mockAIClient{out: &GenerateRecommendationsOutput{
		RawResponse: json.RawMessage(`{"authorization":"Bearer sk-secret-123","x":"sk-abc"}`),
	}}, mockValidator{res: &ValidationResult{
		ValidRecommendations: []ValidatedRecommendation{{Recommendation: AIRecommendationCandidate{
			RecommendationType: "replenish_sku",
			Horizon: "short_term",
			EntityType: "sku",
			Title: "t",
			WhatHappened: "w",
			WhyItMatters: "y",
			RecommendedAction: "a",
			PriorityScore: 10,
			PriorityLevel: "low",
			Urgency: "low",
			ConfidenceLevel: "low",
			SupportingMetrics: map[string]any{"x":1},
			Constraints: map[string]any{"stock_checked":true},
		}}},
	}}, ServiceConfig{})
	_, err := svc.GenerateForAccount(context.Background(), 1, time.Now().UTC())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	raw := string(repo.lastRaw)
	if strings.Contains(raw, "sk-secret-123") || strings.Contains(raw, "sk-abc") {
		t.Fatalf("raw response contains sensitive key material: %s", raw)
	}
}

func TestServiceGetRecommendationDetailByID_IncludesRelatedAlerts(t *testing.T) {
	repo := &mockServiceRepo{}
	svc := NewService(repo, mockBuilder{}, mockAIClient{}, mockValidator{}, ServiceConfig{})
	detail, err := svc.GetRecommendationDetailByID(context.Background(), 77, 55)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if detail.Recommendation.ID != 55 {
		t.Fatalf("unexpected recommendation id: %d", detail.Recommendation.ID)
	}
	if len(detail.RelatedAlerts) != 1 || detail.RelatedAlerts[0].ID != 1 {
		t.Fatalf("expected related alerts in detail response")
	}
}
