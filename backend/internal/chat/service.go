package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrChatAskNotImplemented     = errors.New("chat ask flow is not implemented yet")
	ErrRepositoryRequired        = errors.New("chat repository is required")
	ErrQuestionRequired          = errors.New("chat question is required")
	ErrAIClientRequired          = errors.New("chat ai client is required")
	ErrToolExecutorRequired      = errors.New("chat tool executor is required")
	ErrToolPlanValidatorRequired = errors.New("chat tool plan validator is required")
	ErrContextAssemblerRequired  = errors.New("chat context assembler is required")
	ErrAnswerValidatorRequired   = errors.New("chat answer validator is required")
	ErrInvalidToolPlan           = errors.New("chat tool plan validation failed")
	ErrInvalidAIAnswer           = errors.New("chat answer validation failed")
)

type Service struct {
	repo             Repository
	aiClient         AIClient
	registry         *ToolRegistry
	planValidator    *ToolPlanValidator
	toolSet          ToolExecutor
	contextAssembler *ContextAssembler
	answerValidator  *AnswerValidator

	plannerModel         string
	answerModel          string
	plannerPromptVersion string
	answerPromptVersion  string
}

func NewService(repo Repository) *Service {
	registry := NewDefaultToolRegistry()
	return &Service{
		repo:                 repo,
		registry:             registry,
		planValidator:        NewToolPlanValidator(registry),
		contextAssembler:     NewContextAssembler(),
		answerValidator:      NewAnswerValidator(),
		plannerPromptVersion: PlannerPromptVersion,
		answerPromptVersion:  AnswerPromptVersion,
	}
}

type ServiceConfig struct {
	PlannerModel         string
	AnswerModel          string
	PlannerPromptVersion string
	AnswerPromptVersion  string
}

type ServiceDeps struct {
	Repo              Repository
	AIClient          AIClient
	ToolRegistry      *ToolRegistry
	ToolPlanValidator *ToolPlanValidator
	ToolExecutor      ToolExecutor
	ContextAssembler  *ContextAssembler
	AnswerValidator   *AnswerValidator
	Config            ServiceConfig
}

func NewServiceWithDeps(deps ServiceDeps) (*Service, error) {
	if deps.Repo == nil {
		return nil, ErrRepositoryRequired
	}
	if deps.AIClient == nil {
		return nil, ErrAIClientRequired
	}
	if deps.ToolExecutor == nil {
		return nil, ErrToolExecutorRequired
	}
	registry := deps.ToolRegistry
	if registry == nil {
		registry = NewDefaultToolRegistry()
	}
	planValidator := deps.ToolPlanValidator
	if planValidator == nil {
		planValidator = NewToolPlanValidator(registry)
	}
	contextAssembler := deps.ContextAssembler
	if contextAssembler == nil {
		contextAssembler = NewContextAssembler()
	}
	answerValidator := deps.AnswerValidator
	if answerValidator == nil {
		answerValidator = NewAnswerValidator()
	}
	plannerPromptVersion := deps.Config.PlannerPromptVersion
	if plannerPromptVersion == "" {
		plannerPromptVersion = PlannerPromptVersion
	}
	answerPromptVersion := deps.Config.AnswerPromptVersion
	if answerPromptVersion == "" {
		answerPromptVersion = AnswerPromptVersion
	}
	return &Service{
		repo:                 deps.Repo,
		aiClient:             deps.AIClient,
		registry:             registry,
		planValidator:        planValidator,
		toolSet:              deps.ToolExecutor,
		contextAssembler:     contextAssembler,
		answerValidator:      answerValidator,
		plannerModel:         deps.Config.PlannerModel,
		answerModel:          deps.Config.AnswerModel,
		plannerPromptVersion: plannerPromptVersion,
		answerPromptVersion:  answerPromptVersion,
	}, nil
}

type CreateSessionInput struct {
	SellerAccountID int64
	UserID          *int64
	Title           string
}

type CreateMessageInput struct {
	SessionID       int64
	SellerAccountID int64
	Role            ChatMessageRole
	Content         string
	MessageType     ChatMessageType
}

type AddFeedbackInput struct {
	SellerAccountID int64
	SessionID       int64
	MessageID       int64
	Rating          ChatFeedbackRating
	Comment         *string
}

func (s *Service) CreateSession(ctx context.Context, input CreateSessionInput) (*ChatSession, error) {
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	input.Title = normalizeSessionTitle(input.Title)
	return s.repo.CreateSession(ctx, input)
}

func (s *Service) ListSessions(ctx context.Context, sellerAccountID int64, limit, offset int32) ([]ChatSession, error) {
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	return s.repo.ListSessions(ctx, sellerAccountID, limit, offset)
}

func (s *Service) GetSession(ctx context.Context, sellerAccountID, sessionID int64) (*ChatSession, error) {
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	return s.repo.GetSession(ctx, sellerAccountID, sessionID)
}

func (s *Service) ArchiveSession(ctx context.Context, sellerAccountID, sessionID int64) (*ChatSession, error) {
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	return s.repo.ArchiveSession(ctx, sellerAccountID, sessionID)
}

func (s *Service) ListMessages(ctx context.Context, sellerAccountID, sessionID int64, limit, offset int32) ([]ChatMessage, error) {
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	return s.repo.ListMessages(ctx, sellerAccountID, sessionID, limit, offset)
}

func (s *Service) AddFeedback(ctx context.Context, input AddFeedbackInput) (*ChatFeedback, error) {
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	if input.SellerAccountID <= 0 || input.SessionID <= 0 || input.MessageID <= 0 {
		return nil, errors.New("seller_account_id, session_id and message_id must be > 0")
	}
	switch input.Rating {
	case ChatFeedbackRatingPositive, ChatFeedbackRatingNegative, ChatFeedbackRatingNeutral:
	default:
		return nil, errors.New("invalid feedback rating")
	}
	msg, err := s.repo.GetMessage(ctx, input.SellerAccountID, input.MessageID)
	if err != nil {
		return nil, err
	}
	if msg == nil {
		return nil, errors.New("message not found")
	}
	if msg.SessionID != input.SessionID {
		return nil, errors.New("message does not belong to session")
	}
	if msg.Role != ChatMessageRoleAssistant || msg.MessageType != ChatMessageTypeAnswer {
		return nil, errors.New("feedback is allowed only for assistant answer messages")
	}
	return s.repo.CreateFeedback(ctx, input)
}

func (s *Service) Ask(ctx context.Context, input AskInput) (*AskResult, error) {
	question := strings.TrimSpace(input.Question)
	if question == "" {
		return nil, ErrQuestionRequired
	}
	if input.SellerAccountID <= 0 {
		return nil, errors.New("seller_account_id must be > 0")
	}
	if input.SessionID != nil && *input.SessionID <= 0 {
		return nil, errors.New("session_id must be > 0")
	}
	if input.UserID != nil && *input.UserID <= 0 {
		return nil, errors.New("user_id must be > 0")
	}
	if s.repo == nil {
		return nil, ErrRepositoryRequired
	}
	if s.aiClient == nil {
		return nil, ErrAIClientRequired
	}
	if s.planValidator == nil {
		return nil, ErrToolPlanValidatorRequired
	}
	if s.toolSet == nil {
		return nil, ErrToolExecutorRequired
	}
	if s.contextAssembler == nil {
		return nil, ErrContextAssemblerRequired
	}
	if s.answerValidator == nil {
		return nil, ErrAnswerValidatorRequired
	}
	if s.registry == nil {
		s.registry = NewDefaultToolRegistry()
	}

	session, err := s.resolveSession(ctx, input, question)
	if err != nil {
		return nil, err
	}
	userMsg, err := s.repo.CreateMessage(ctx, CreateMessageInput{
		SessionID: session.ID, SellerAccountID: input.SellerAccountID, Role: ChatMessageRoleUser,
		Content: question, MessageType: ChatMessageTypeQuestion,
	})
	if err != nil {
		return nil, err
	}
	_, _ = s.repo.TouchSession(ctx, input.SellerAccountID, session.ID)

	trace, err := s.repo.CreateTrace(ctx, CreateTraceInput{
		SessionID:            session.ID,
		UserMessageID:        &userMsg.ID,
		SellerAccountID:      input.SellerAccountID,
		PlannerPromptVersion: safePromptVersion(s.plannerPromptVersion, PlannerPromptVersion),
		AnswerPromptVersion:  safePromptVersion(s.answerPromptVersion, AnswerPromptVersion),
		PlannerModel:         fallbackString(s.plannerModel, "unknown"),
		AnswerModel:          fallbackString(s.answerModel, "unknown"),
	})
	if err != nil {
		return nil, err
	}

	tools := s.registry.List()
	plannerSystemPrompt := BuildPlannerSystemPrompt(tools)
	plannerUserPrompt := BuildPlannerUserPrompt(question, input.AsOfDate)
	plannerOutput, err := s.aiClient.PlanTools(ctx, PlanToolsInput{
		SystemPrompt: plannerSystemPrompt,
		UserPrompt:   plannerUserPrompt,
	})
	if err != nil {
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID: input.SellerAccountID,
			TraceID:         trace.ID,
			ErrorMessage:    errorString(err),
		})
		return nil, err
	}

	validatedPlan, err := s.planValidator.Validate(&plannerOutput.Plan)
	if err != nil {
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID:    input.SellerAccountID,
			TraceID:            trace.ID,
			DetectedIntent:     plannerOutput.Plan.Intent,
			ToolPlanPayload:    payloadMap(plannerOutput.Plan),
			RawPlannerResponse: payloadJSONMap(plannerOutput.RawResponse),
			InputTokens:        plannerOutput.InputTokens,
			OutputTokens:       plannerOutput.OutputTokens,
			ErrorMessage:       errorString(err),
		})
		return nil, fmt.Errorf("%w: %v", ErrInvalidToolPlan, err)
	}

	toolResults, toolErr := s.toolSet.ExecutePlan(ctx, input.SellerAccountID, *validatedPlan)
	if toolErr != nil && len(toolResults) == 0 {
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID:          input.SellerAccountID,
			TraceID:                  trace.ID,
			DetectedIntent:           validatedPlan.Intent,
			ToolPlanPayload:          payloadMap(plannerOutput.Plan),
			ValidatedToolPlanPayload: payloadMap(validatedPlan),
			RawPlannerResponse:       payloadJSONMap(plannerOutput.RawResponse),
			InputTokens:              plannerOutput.InputTokens,
			OutputTokens:             plannerOutput.OutputTokens,
			ErrorMessage:             errorString(toolErr),
		})
		return nil, toolErr
	}

	factContext, err := s.contextAssembler.Assemble(AssembleContextInput{
		Question:        question,
		SellerAccountID: input.SellerAccountID,
		Plan:            *validatedPlan,
		ToolResults:     toolResults,
		AsOfDate:        input.AsOfDate,
		Language:        plannerOutput.Plan.Language,
	})
	if err != nil {
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID:          input.SellerAccountID,
			TraceID:                  trace.ID,
			DetectedIntent:           validatedPlan.Intent,
			ToolPlanPayload:          payloadMap(plannerOutput.Plan),
			ValidatedToolPlanPayload: payloadMap(validatedPlan),
			ToolResultsPayload:       payloadMap(toolResults),
			RawPlannerResponse:       payloadJSONMap(plannerOutput.RawResponse),
			InputTokens:              plannerOutput.InputTokens,
			OutputTokens:             plannerOutput.OutputTokens,
			ErrorMessage:             errorString(err),
		})
		return nil, err
	}

	answerOutput, err := s.aiClient.GenerateAnswer(ctx, GenerateAnswerInput{
		SystemPrompt: BuildAnswerSystemPrompt(),
		UserPrompt:   BuildAnswerUserPrompt(*factContext),
		FactContext:  factContext,
	})
	if err != nil {
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID:          input.SellerAccountID,
			TraceID:                  trace.ID,
			DetectedIntent:           validatedPlan.Intent,
			ToolPlanPayload:          payloadMap(plannerOutput.Plan),
			ValidatedToolPlanPayload: payloadMap(validatedPlan),
			ToolResultsPayload:       payloadMap(toolResults),
			FactContextPayload:       payloadMap(factContext),
			RawPlannerResponse:       payloadJSONMap(plannerOutput.RawResponse),
			ErrorMessage:             errorString(err),
			InputTokens:              plannerOutput.InputTokens,
			OutputTokens:             plannerOutput.OutputTokens,
		})
		return nil, err
	}
	validation, err := s.answerValidator.Validate(&answerOutput.Answer, factContext)
	if err != nil || !validation.IsValid {
		errMsg := errorString(err)
		if errMsg == "" {
			errMsg = ErrInvalidAIAnswer.Error()
		}
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID:          input.SellerAccountID,
			TraceID:                  trace.ID,
			DetectedIntent:           validatedPlan.Intent,
			ToolPlanPayload:          payloadMap(plannerOutput.Plan),
			ValidatedToolPlanPayload: payloadMap(validatedPlan),
			ToolResultsPayload:       payloadMap(toolResults),
			FactContextPayload:       payloadMap(factContext),
			RawPlannerResponse:       payloadJSONMap(plannerOutput.RawResponse),
			RawAnswerResponse:        payloadJSONMap(answerOutput.RawResponse),
			AnswerValidationPayload:  payloadMap(validation),
			InputTokens:              plannerOutput.InputTokens + answerOutput.InputTokens,
			OutputTokens:             plannerOutput.OutputTokens + answerOutput.OutputTokens,
			ErrorMessage:             errMsg,
		})
		if err != nil {
			return nil, err
		}
		return nil, ErrInvalidAIAnswer
	}

	finalAnswer := answerOutput.Answer
	finalAnswer.ConfidenceLevel = validation.FinalConfidenceLevel
	assistantMsg, err := s.repo.CreateMessage(ctx, CreateMessageInput{
		SessionID: session.ID, SellerAccountID: input.SellerAccountID, Role: ChatMessageRoleAssistant,
		Content: strings.TrimSpace(finalAnswer.Answer), MessageType: ChatMessageTypeAnswer,
	})
	if err != nil {
		s.failTraceBestEffort(ctx, FailTraceInput{
			SellerAccountID:          input.SellerAccountID,
			TraceID:                  trace.ID,
			DetectedIntent:           validatedPlan.Intent,
			ToolPlanPayload:          payloadMap(plannerOutput.Plan),
			ValidatedToolPlanPayload: payloadMap(validatedPlan),
			ToolResultsPayload:       payloadMap(toolResults),
			FactContextPayload:       payloadMap(factContext),
			RawPlannerResponse:       payloadJSONMap(plannerOutput.RawResponse),
			RawAnswerResponse:        payloadJSONMap(answerOutput.RawResponse),
			AnswerValidationPayload:  payloadMap(validation),
			InputTokens:              plannerOutput.InputTokens + answerOutput.InputTokens,
			OutputTokens:             plannerOutput.OutputTokens + answerOutput.OutputTokens,
			ErrorMessage:             errorString(err),
		})
		return nil, err
	}
	_, _ = s.repo.TouchSession(ctx, input.SellerAccountID, session.ID)

	_, err = s.repo.CompleteTrace(ctx, CompleteTraceInput{
		SellerAccountID:          input.SellerAccountID,
		TraceID:                  trace.ID,
		AssistantMessageID:       &assistantMsg.ID,
		DetectedIntent:           validatedPlan.Intent,
		ToolPlanPayload:          payloadMap(plannerOutput.Plan),
		ValidatedToolPlanPayload: payloadMap(validatedPlan),
		ToolResultsPayload:       payloadMap(toolResults),
		FactContextPayload:       payloadMap(factContext),
		RawPlannerResponse:       payloadJSONMap(plannerOutput.RawResponse),
		RawAnswerResponse:        payloadJSONMap(answerOutput.RawResponse),
		AnswerValidationPayload:  payloadMap(validation),
		InputTokens:              plannerOutput.InputTokens + answerOutput.InputTokens,
		OutputTokens:             plannerOutput.OutputTokens + answerOutput.OutputTokens,
		EstimatedCost:            0,
	})
	if err != nil {
		return nil, err
	}
	return &AskResult{
		SessionID:          session.ID,
		UserMessageID:      userMsg.ID,
		AssistantMessageID: &assistantMsg.ID,
		TraceID:            trace.ID,
		Answer:             &finalAnswer,
	}, nil
}

func normalizeSessionTitle(title string) string {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return "New chat"
	}
	return trimmed
}

func (s *Service) resolveSession(ctx context.Context, input AskInput, question string) (*ChatSession, error) {
	if input.SessionID == nil {
		return s.repo.CreateSession(ctx, CreateSessionInput{
			SellerAccountID: input.SellerAccountID,
			UserID:          input.UserID,
			Title:           deriveSessionTitle(question),
		})
	}
	session, err := s.repo.GetSession(ctx, input.SellerAccountID, *input.SessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, errors.New("chat session was not found")
	}
	if session.Status == ChatSessionStatusArchived {
		return nil, errors.New("chat session is archived")
	}
	return session, nil
}

func deriveSessionTitle(question string) string {
	q := strings.TrimSpace(question)
	if q == "" {
		return "New chat"
	}
	r := []rune(q)
	if len(r) > 80 {
		return strings.TrimSpace(string(r[:80]))
	}
	return q
}

func (s *Service) failTraceBestEffort(ctx context.Context, input FailTraceInput) {
	if s.repo == nil || input.TraceID <= 0 || input.SellerAccountID <= 0 {
		return
	}
	_, _ = s.repo.FailTrace(ctx, input)
}

func payloadMap(v any) map[string]any {
	if v == nil {
		return map[string]any{}
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return map[string]any{"serialization_error": err.Error()}
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err == nil {
		return out
	}
	var arr []any
	if err := json.Unmarshal(raw, &arr); err == nil {
		return map[string]any{"items": arr}
	}
	return map[string]any{"raw": string(raw)}
}

func payloadJSONMap(raw json.RawMessage) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err == nil {
		return out
	}
	var arr []any
	if err := json.Unmarshal(raw, &arr); err == nil {
		return map[string]any{"items": arr}
	}
	return map[string]any{"raw": string(raw)}
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return strings.TrimSpace(err.Error())
}

func safePromptVersion(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func fallbackString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return strings.TrimSpace(v)
}
