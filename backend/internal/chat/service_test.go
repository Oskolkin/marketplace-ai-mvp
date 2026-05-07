package chat

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestServiceAskHappyPath(t *testing.T) {
	repo := newFakeRepo()
	ai := &fakeAIClient{
		planOut: &PlanToolsOutput{
			Plan: ToolPlan{
				Intent:     ChatIntentPriorities,
				Confidence: 0.9,
				Language:   "ru",
				ToolCalls:  []ToolCall{{Name: ToolGetDashboardSummary, Args: map[string]any{}}},
			},
			InputTokens:  10,
			OutputTokens: 20,
		},
		answerOut: &GenerateAnswerOutput{
			Answer: ChatAnswer{
				Answer:          "По dashboard есть риск.",
				Summary:         "Нужна ручная проверка.",
				Intent:          ChatIntentPriorities,
				ConfidenceLevel: ConfidenceLevelHigh,
				SupportingFacts: []SupportingFact{{Source: "dashboard", Fact: "revenue trend"}},
				Limitations:     []string{"данные ограничены"},
			},
			InputTokens:  30,
			OutputTokens: 40,
		},
	}
	toolExec := &fakeToolExecutor{
		results: []ToolResult{
			{Name: ToolGetDashboardSummary, Data: map[string]any{"kpi": map[string]any{"revenue": 100}, "data_freshness": "fresh"}},
		},
	}
	svc, err := NewServiceWithDeps(ServiceDeps{
		Repo:              repo,
		AIClient:          ai,
		ToolRegistry:      NewDefaultToolRegistry(),
		ToolPlanValidator: NewToolPlanValidator(NewDefaultToolRegistry()),
		ToolExecutor:      toolExec,
		ContextAssembler:  NewContextAssembler(),
		AnswerValidator:   NewAnswerValidator(),
		Config: ServiceConfig{
			PlannerModel: "gpt-p",
			AnswerModel:  "gpt-a",
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	out, err := svc.Ask(context.Background(), AskInput{
		SellerAccountID: 1,
		Question:        "Что делать?",
	})
	if err != nil {
		t.Fatalf("ask failed: %v", err)
	}
	if out == nil || out.Answer == nil || out.AssistantMessageID == nil {
		t.Fatal("expected full ask result")
	}
	if repo.createSessionCalls != 1 || repo.createMessageCalls < 2 || repo.completeTraceCalls != 1 {
		t.Fatalf("unexpected repo calls: %+v", repo)
	}
	if repo.failTraceCalls != 0 {
		t.Fatalf("fail trace should not be called")
	}
	if repo.lastCompleteTrace.InputTokens != 40 || repo.lastCompleteTrace.OutputTokens != 60 {
		t.Fatalf("token sum mismatch")
	}
	if repo.lastCompleteTrace.DetectedIntent != ChatIntentPriorities {
		t.Fatalf("detected intent mismatch")
	}
}

func TestServiceAskEmptyQuestion(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo)
	_, err := svc.Ask(context.Background(), AskInput{SellerAccountID: 1, Question: "  "})
	if !errors.Is(err, ErrQuestionRequired) {
		t.Fatalf("expected ErrQuestionRequired, got %v", err)
	}
	if repo.createSessionCalls != 0 && repo.createMessageCalls != 0 {
		t.Fatal("repo should not be called")
	}
}

func TestServiceAskPlannerErrorFailsTrace(t *testing.T) {
	repo := newFakeRepo()
	ai := &fakeAIClient{planErr: errors.New("planner down")}
	svc, _ := NewServiceWithDeps(ServiceDeps{
		Repo: repo, AIClient: ai, ToolExecutor: &fakeToolExecutor{},
		ToolRegistry: NewDefaultToolRegistry(), ToolPlanValidator: NewToolPlanValidator(NewDefaultToolRegistry()),
		ContextAssembler: NewContextAssembler(), AnswerValidator: NewAnswerValidator(),
	})
	_, err := svc.Ask(context.Background(), AskInput{SellerAccountID: 1, Question: "Q"})
	if err == nil {
		t.Fatal("expected planner error")
	}
	if repo.failTraceCalls != 1 || repo.completeTraceCalls != 0 {
		t.Fatalf("trace flow mismatch")
	}
}

func TestServiceAskInvalidToolPlanFailsBeforeToolExecution(t *testing.T) {
	repo := newFakeRepo()
	ai := &fakeAIClient{
		planOut: &PlanToolsOutput{
			Plan: ToolPlan{
				Intent:     ChatIntentPriorities,
				Confidence: 0.9,
				Language:   "ru",
				ToolCalls:  []ToolCall{{Name: "unknown_tool", Args: map[string]any{}}},
			},
		},
	}
	toolExec := &fakeToolExecutor{}
	svc, _ := NewServiceWithDeps(ServiceDeps{
		Repo: repo, AIClient: ai, ToolExecutor: toolExec,
		ToolRegistry: NewDefaultToolRegistry(), ToolPlanValidator: NewToolPlanValidator(NewDefaultToolRegistry()),
		ContextAssembler: NewContextAssembler(), AnswerValidator: NewAnswerValidator(),
	})
	_, err := svc.Ask(context.Background(), AskInput{SellerAccountID: 1, Question: "Q"})
	if err == nil {
		t.Fatal("expected invalid plan error")
	}
	if toolExec.executePlanCalls != 0 {
		t.Fatal("tool executor must not be called")
	}
	if repo.failTraceCalls != 1 {
		t.Fatal("trace should be failed")
	}
}

func TestServiceAskToolExecutionFullFailure(t *testing.T) {
	repo := newFakeRepo()
	ai := &fakeAIClient{
		planOut: &PlanToolsOutput{
			Plan: ToolPlan{
				Intent:     ChatIntentPriorities,
				Confidence: 0.9,
				Language:   "ru",
				ToolCalls:  []ToolCall{{Name: ToolGetDashboardSummary, Args: map[string]any{}}},
			},
		},
	}
	toolExec := &fakeToolExecutor{err: errors.New("tools failed"), results: nil}
	svc, _ := NewServiceWithDeps(ServiceDeps{
		Repo: repo, AIClient: ai, ToolExecutor: toolExec,
		ToolRegistry: NewDefaultToolRegistry(), ToolPlanValidator: NewToolPlanValidator(NewDefaultToolRegistry()),
		ContextAssembler: NewContextAssembler(), AnswerValidator: NewAnswerValidator(),
	})
	_, err := svc.Ask(context.Background(), AskInput{SellerAccountID: 1, Question: "Q"})
	if err == nil {
		t.Fatal("expected tool execution error")
	}
	if repo.failTraceCalls != 1 {
		t.Fatal("trace should be failed")
	}
}

func TestServiceAskAnswerValidationFailure(t *testing.T) {
	repo := newFakeRepo()
	ai := &fakeAIClient{
		planOut: &PlanToolsOutput{
			Plan: ToolPlan{
				Intent:     ChatIntentPriorities,
				Confidence: 0.9,
				Language:   "ru",
				ToolCalls:  []ToolCall{{Name: ToolGetOpenAlerts, Args: map[string]any{"limit": 1}}},
			},
		},
		answerOut: &GenerateAnswerOutput{
			Answer: ChatAnswer{
				Answer:          "alert 999 требует внимания",
				Summary:         "S",
				ConfidenceLevel: ConfidenceLevelHigh,
				SupportingFacts: []SupportingFact{{Source: "alert", Fact: "f"}},
			},
		},
	}
	toolExec := &fakeToolExecutor{
		results: []ToolResult{{Name: ToolGetOpenAlerts, Data: map[string]any{"items": []any{map[string]any{"id": 101, "alert_type": "stock"}}}}},
	}
	svc, _ := NewServiceWithDeps(ServiceDeps{
		Repo: repo, AIClient: ai, ToolExecutor: toolExec,
		ToolRegistry: NewDefaultToolRegistry(), ToolPlanValidator: NewToolPlanValidator(NewDefaultToolRegistry()),
		ContextAssembler: NewContextAssembler(), AnswerValidator: NewAnswerValidator(),
	})
	_, err := svc.Ask(context.Background(), AskInput{SellerAccountID: 1, Question: "Q"})
	if !errors.Is(err, ErrInvalidAIAnswer) {
		t.Fatalf("expected ErrInvalidAIAnswer, got %v", err)
	}
	if repo.createAssistantMessageCount != 0 {
		t.Fatal("assistant message should not be saved on validation failure")
	}
	if repo.failTraceCalls != 1 {
		t.Fatal("trace should be failed")
	}
}

type fakeAIClient struct {
	planOut   *PlanToolsOutput
	answerOut *GenerateAnswerOutput
	planErr   error
	answerErr error
}

func (f *fakeAIClient) PlanTools(ctx context.Context, input PlanToolsInput) (*PlanToolsOutput, error) {
	if f.planErr != nil {
		return nil, f.planErr
	}
	return f.planOut, nil
}

func (f *fakeAIClient) GenerateAnswer(ctx context.Context, input GenerateAnswerInput) (*GenerateAnswerOutput, error) {
	if f.answerErr != nil {
		return nil, f.answerErr
	}
	return f.answerOut, nil
}

type fakeToolExecutor struct {
	results          []ToolResult
	err              error
	executePlanCalls int
}

func (f *fakeToolExecutor) Execute(ctx context.Context, sellerAccountID int64, call ToolCall) (*ToolResult, error) {
	return nil, errors.New("not implemented")
}

func (f *fakeToolExecutor) ExecutePlan(ctx context.Context, sellerAccountID int64, plan ValidatedToolPlan) ([]ToolResult, error) {
	f.executePlanCalls++
	return f.results, f.err
}

type fakeRepo struct {
	nextSessionID int64
	nextMessageID int64
	nextTraceID   int64
	sessions      map[int64]*ChatSession

	createSessionCalls          int
	createMessageCalls          int
	createAssistantMessageCount int
	createTraceCalls            int
	completeTraceCalls          int
	failTraceCalls              int
	touchSessionCalls           int

	lastCompleteTrace CompleteTraceInput
	lastFailTrace     FailTraceInput
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		nextSessionID: 1, nextMessageID: 1, nextTraceID: 1,
		sessions: map[int64]*ChatSession{},
	}
}

func (f *fakeRepo) CreateSession(ctx context.Context, input CreateSessionInput) (*ChatSession, error) {
	f.createSessionCalls++
	id := f.nextSessionID
	f.nextSessionID++
	s := &ChatSession{ID: id, SellerAccountID: input.SellerAccountID, UserID: input.UserID, Title: input.Title, Status: ChatSessionStatusActive}
	f.sessions[id] = s
	return s, nil
}
func (f *fakeRepo) GetSession(ctx context.Context, sellerAccountID, sessionID int64) (*ChatSession, error) {
	s := f.sessions[sessionID]
	if s == nil || s.SellerAccountID != sellerAccountID {
		return nil, nil
	}
	return s, nil
}
func (f *fakeRepo) ListSessions(ctx context.Context, sellerAccountID int64, limit, offset int32) ([]ChatSession, error) {
	return nil, nil
}
func (f *fakeRepo) ListActiveSessions(ctx context.Context, sellerAccountID int64, limit, offset int32) ([]ChatSession, error) {
	return nil, nil
}
func (f *fakeRepo) ArchiveSession(ctx context.Context, sellerAccountID, sessionID int64) (*ChatSession, error) {
	return nil, nil
}
func (f *fakeRepo) TouchSession(ctx context.Context, sellerAccountID, sessionID int64) (*ChatSession, error) {
	f.touchSessionCalls++
	return f.sessions[sessionID], nil
}
func (f *fakeRepo) UpdateSessionTitle(ctx context.Context, sellerAccountID, sessionID int64, title string) (*ChatSession, error) {
	return f.sessions[sessionID], nil
}
func (f *fakeRepo) CreateMessage(ctx context.Context, input CreateMessageInput) (*ChatMessage, error) {
	f.createMessageCalls++
	if input.Role == ChatMessageRoleAssistant {
		f.createAssistantMessageCount++
	}
	id := f.nextMessageID
	f.nextMessageID++
	return &ChatMessage{
		ID: id, SessionID: input.SessionID, SellerAccountID: input.SellerAccountID, Role: input.Role, Content: input.Content, MessageType: input.MessageType,
		CreatedAt: time.Now().UTC(),
	}, nil
}
func (f *fakeRepo) GetMessage(ctx context.Context, sellerAccountID, messageID int64) (*ChatMessage, error) {
	return nil, nil
}
func (f *fakeRepo) ListMessages(ctx context.Context, sellerAccountID, sessionID int64, limit, offset int32) ([]ChatMessage, error) {
	return nil, nil
}
func (f *fakeRepo) ListRecentMessages(ctx context.Context, sellerAccountID, sessionID int64, limit int32) ([]ChatMessage, error) {
	return nil, nil
}
func (f *fakeRepo) CreateTrace(ctx context.Context, input CreateTraceInput) (*ChatTrace, error) {
	f.createTraceCalls++
	id := f.nextTraceID
	f.nextTraceID++
	return &ChatTrace{ID: id, SessionID: input.SessionID, SellerAccountID: input.SellerAccountID, Status: ChatTraceStatusRunning}, nil
}
func (f *fakeRepo) CompleteTrace(ctx context.Context, input CompleteTraceInput) (*ChatTrace, error) {
	f.completeTraceCalls++
	f.lastCompleteTrace = input
	return &ChatTrace{ID: input.TraceID, Status: ChatTraceStatusCompleted}, nil
}
func (f *fakeRepo) FailTrace(ctx context.Context, input FailTraceInput) (*ChatTrace, error) {
	f.failTraceCalls++
	f.lastFailTrace = input
	return &ChatTrace{ID: input.TraceID, Status: ChatTraceStatusFailed}, nil
}
func (f *fakeRepo) GetTrace(ctx context.Context, sellerAccountID, traceID int64) (*ChatTrace, error) {
	return nil, nil
}
func (f *fakeRepo) GetLatestTraceBySession(ctx context.Context, sellerAccountID, sessionID int64) (*ChatTrace, error) {
	return nil, nil
}
func (f *fakeRepo) ListTracesBySession(ctx context.Context, sellerAccountID, sessionID int64, limit, offset int32) ([]ChatTrace, error) {
	return nil, nil
}
func (f *fakeRepo) CreateFeedback(ctx context.Context, input AddFeedbackInput) (*ChatFeedback, error) {
	return nil, nil
}
func (f *fakeRepo) GetFeedbackByMessage(ctx context.Context, sellerAccountID, messageID int64) (*ChatFeedback, error) {
	return nil, nil
}
func (f *fakeRepo) ListFeedback(ctx context.Context, sellerAccountID int64, limit, offset int32) ([]ChatFeedback, error) {
	return nil, nil
}
