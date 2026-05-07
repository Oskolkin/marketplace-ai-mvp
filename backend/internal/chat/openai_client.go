package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const defaultOpenAIBaseURL = "https://api.openai.com/v1"

var (
	ErrOpenAIAPIKeyMissing = errors.New("openai api key is missing")
	ErrOpenAIProvider      = errors.New("openai provider error")
)

type AIClient interface {
	PlanTools(ctx context.Context, input PlanToolsInput) (*PlanToolsOutput, error)
	GenerateAnswer(ctx context.Context, input GenerateAnswerInput) (*GenerateAnswerOutput, error)
}

type OpenAIClientConfig struct {
	APIKey         string
	Model          string
	TimeoutSeconds int
	MaxRetries     int
	BaseURL        string
}

type OpenAIClient struct {
	httpClient *http.Client
	cfg        OpenAIClientConfig
}

type PlanToolsInput struct {
	SystemPrompt string
	UserPrompt   string
}

type PlanToolsOutput struct {
	Plan          ToolPlan
	Content       string
	RawResponse   json.RawMessage
	Model         string
	RequestID     string
	InputTokens   int32
	OutputTokens  int32
	TotalTokens   int32
	FinishedAtUTC time.Time
}

type GenerateAnswerInput struct {
	SystemPrompt string
	UserPrompt   string
	FactContext  *FactContext
}

type GenerateAnswerOutput struct {
	Answer        ChatAnswer
	Content       string
	RawResponse   json.RawMessage
	Model         string
	RequestID     string
	InputTokens   int32
	OutputTokens  int32
	TotalTokens   int32
	FinishedAtUTC time.Time
}

type openAIResponsesRequest struct {
	Model       string            `json:"model"`
	Input       []openAIInputItem `json:"input"`
	Temperature float64           `json:"temperature"`
}

type openAIInputItem struct {
	Role    string              `json:"role"`
	Content []openAIContentItem `json:"content"`
}

type openAIContentItem struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type openAIResponsesResponse struct {
	ID     string `json:"id"`
	Model  string `json:"model"`
	Output []struct {
		Type    string `json:"type"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
		TotalTokens  int `json:"total_tokens"`
	} `json:"usage"`
}

func NewOpenAIClient(cfg OpenAIClientConfig) *OpenAIClient {
	timeout := cfg.TimeoutSeconds
	if timeout <= 0 {
		timeout = 30
	}
	if cfg.Model == "" {
		cfg.Model = "gpt-4.1-mini"
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultOpenAIBaseURL
	}
	return &OpenAIClient{
		httpClient: &http.Client{Timeout: time.Duration(timeout) * time.Second},
		cfg:        cfg,
	}
}

func (c *OpenAIClient) PlanTools(ctx context.Context, input PlanToolsInput) (*PlanToolsOutput, error) {
	if strings.TrimSpace(c.cfg.APIKey) == "" {
		return nil, ErrOpenAIAPIKeyMissing
	}
	reqBody := openAIResponsesRequest{
		Model: c.cfg.Model,
		Input: []openAIInputItem{
			{Role: "system", Content: []openAIContentItem{{Type: "input_text", Text: strings.TrimSpace(input.SystemPrompt)}}},
			{Role: "user", Content: []openAIContentItem{{Type: "input_text", Text: strings.TrimSpace(input.UserPrompt)}}},
		},
		Temperature: 0.1,
	}
	respBody, requestID, err := c.doWithRetry(ctx, reqBody)
	if err != nil {
		return nil, err
	}
	var decoded openAIResponsesResponse
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return nil, fmt.Errorf("decode openai response: %w", err)
	}
	content := extractOutputText(decoded)
	if strings.TrimSpace(content) == "" {
		return nil, errors.New("planner response is empty")
	}
	var plan ToolPlan
	if err := parseJSONPayload(content, &plan); err != nil {
		return nil, fmt.Errorf("parse planner json: %w", err)
	}
	return &PlanToolsOutput{
		Plan:          plan,
		Content:       content,
		RawResponse:   json.RawMessage(respBody),
		Model:         decoded.Model,
		RequestID:     requestID,
		InputTokens:   int32(decoded.Usage.InputTokens),
		OutputTokens:  int32(decoded.Usage.OutputTokens),
		TotalTokens:   int32(decoded.Usage.TotalTokens),
		FinishedAtUTC: time.Now().UTC(),
	}, nil
}

func (c *OpenAIClient) GenerateAnswer(ctx context.Context, input GenerateAnswerInput) (*GenerateAnswerOutput, error) {
	if strings.TrimSpace(c.cfg.APIKey) == "" {
		return nil, ErrOpenAIAPIKeyMissing
	}
	reqBody := openAIResponsesRequest{
		Model: c.cfg.Model,
		Input: []openAIInputItem{
			{Role: "system", Content: []openAIContentItem{{Type: "input_text", Text: strings.TrimSpace(input.SystemPrompt)}}},
			{Role: "user", Content: []openAIContentItem{{Type: "input_text", Text: strings.TrimSpace(input.UserPrompt)}}},
		},
		Temperature: 0.2,
	}
	respBody, requestID, err := c.doWithRetry(ctx, reqBody)
	if err != nil {
		return nil, err
	}
	var decoded openAIResponsesResponse
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return nil, fmt.Errorf("decode openai response: %w", err)
	}
	content := extractOutputText(decoded)
	if strings.TrimSpace(content) == "" {
		return nil, errors.New("answerer response is empty")
	}
	var answer ChatAnswer
	if err := parseJSONPayload(content, &answer); err != nil {
		return nil, fmt.Errorf("parse answer json: %w", err)
	}
	return &GenerateAnswerOutput{
		Answer:        answer,
		Content:       content,
		RawResponse:   json.RawMessage(respBody),
		Model:         decoded.Model,
		RequestID:     requestID,
		InputTokens:   int32(decoded.Usage.InputTokens),
		OutputTokens:  int32(decoded.Usage.OutputTokens),
		TotalTokens:   int32(decoded.Usage.TotalTokens),
		FinishedAtUTC: time.Now().UTC(),
	}, nil
}

func (c *OpenAIClient) doWithRetry(ctx context.Context, reqBody openAIResponsesRequest) ([]byte, string, error) {
	attempts := c.cfg.MaxRetries + 1
	if attempts <= 0 {
		attempts = 1
	}
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		body, requestID, err := c.doOnce(ctx, reqBody)
		if err == nil {
			return body, requestID, nil
		}
		lastErr = err
		if !isRetryableOpenAIError(err) || attempt == attempts {
			return nil, "", err
		}
		delay := time.Duration(attempt) * 500 * time.Millisecond
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, "", ctx.Err()
		case <-timer.C:
		}
	}
	return nil, "", lastErr
}

func (c *OpenAIClient) doOnce(ctx context.Context, reqBody openAIResponsesRequest) ([]byte, string, error) {
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, "", fmt.Errorf("marshal openai request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.cfg.BaseURL, "/")+"/responses", bytes.NewReader(payload))
	if err != nil {
		return nil, "", fmt.Errorf("build openai request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		var netErr net.Error
		if errors.As(err, &netErr) {
			return nil, "", fmt.Errorf("%w: %v", ErrOpenAIProvider, err)
		}
		return nil, "", fmt.Errorf("%w: %v", ErrOpenAIProvider, err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 16*1024*1024))
	if err != nil {
		return nil, "", fmt.Errorf("read openai response: %w", err)
	}
	requestID := resp.Header.Get("x-request-id")
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return respBody, requestID, nil
	}
	errBody := strings.TrimSpace(string(respBody))
	if errBody == "" {
		errBody = "<empty>"
	}
	return nil, requestID, &openAIHTTPError{StatusCode: resp.StatusCode, Body: errBody}
}

type openAIHTTPError struct {
	StatusCode int
	Body       string
}

func (e *openAIHTTPError) Error() string {
	return fmt.Sprintf("%v: status=%d body=%s", ErrOpenAIProvider, e.StatusCode, e.Body)
}

func isRetryableOpenAIError(err error) bool {
	var httpErr *openAIHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode == http.StatusTooManyRequests || httpErr.StatusCode >= 500
	}
	return errors.Is(err, ErrOpenAIProvider)
}

func extractOutputText(resp openAIResponsesResponse) string {
	var b strings.Builder
	for _, item := range resp.Output {
		for _, c := range item.Content {
			if c.Type == "output_text" || c.Type == "text" {
				if b.Len() > 0 {
					b.WriteString("\n")
				}
				b.WriteString(c.Text)
			}
		}
	}
	return b.String()
}

func parseJSONPayload(content string, dst any) error {
	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
		trimmed = strings.TrimPrefix(trimmed, "```")
		trimmed = strings.TrimSuffix(trimmed, "```")
		trimmed = strings.TrimSpace(trimmed)
	}
	if err := json.Unmarshal([]byte(trimmed), dst); err == nil {
		return nil
	}
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start >= 0 && end > start {
		return json.Unmarshal([]byte(trimmed[start:end+1]), dst)
	}
	return errors.New("json object not found")
}
