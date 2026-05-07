package chat

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAIClientPlanToolsParsesStrictJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_plan_1")
		_, _ = w.Write([]byte(`{
			"id":"resp_1","model":"gpt-test","output":[{"type":"message","content":[{"type":"output_text","text":"{\"intent\":\"priorities\",\"confidence\":0.9,\"language\":\"ru\",\"tool_calls\":[{\"name\":\"get_open_recommendations\",\"args\":{\"limit\":5}}],\"assumptions\":[\"a1\"]}"}]}],
			"usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30}
		}`))
	}))
	defer srv.Close()

	client := NewOpenAIClient(OpenAIClientConfig{
		APIKey:  "k",
		Model:   "gpt-test",
		BaseURL: srv.URL,
	})
	out, err := client.PlanTools(context.Background(), PlanToolsInput{SystemPrompt: "s", UserPrompt: "u"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.Plan.Intent != ChatIntentPriorities {
		t.Fatalf("intent parse failed: %s", out.Plan.Intent)
	}
	if out.RequestID != "req_plan_1" || out.TotalTokens != 30 {
		t.Fatalf("metadata parse failed")
	}
}

func TestOpenAIClientGenerateAnswerParsesJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_answer_1")
		_, _ = w.Write([]byte(`{
			"id":"resp_2","model":"gpt-test","output":[{"type":"message","content":[{"type":"output_text","text":"{\"answer\":\"ok\",\"summary\":\"sum\",\"intent\":\"sales\",\"confidence_level\":\"high\",\"related_alert_ids\":[1],\"related_recommendation_ids\":[2],\"supporting_facts\":[{\"source\":\"tool\",\"id\":1,\"fact\":\"f\"}],\"limitations\":[\"l\"]}"}]}],
			"usage":{"input_tokens":11,"output_tokens":22,"total_tokens":33}
		}`))
	}))
	defer srv.Close()

	client := NewOpenAIClient(OpenAIClientConfig{
		APIKey:  "k",
		Model:   "gpt-test",
		BaseURL: srv.URL,
	})
	out, err := client.GenerateAnswer(context.Background(), GenerateAnswerInput{SystemPrompt: "s", UserPrompt: "u"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.Answer.Answer != "ok" || out.Answer.ConfidenceLevel != ConfidenceLevelHigh {
		t.Fatalf("answer parse failed")
	}
	if out.RequestID != "req_answer_1" || out.TotalTokens != 33 {
		t.Fatalf("metadata parse failed")
	}
}

func TestOpenAIClientMissingAPIKey(t *testing.T) {
	client := NewOpenAIClient(OpenAIClientConfig{APIKey: ""})
	_, err := client.PlanTools(context.Background(), PlanToolsInput{SystemPrompt: "s", UserPrompt: "u"})
	if !errors.Is(err, ErrOpenAIAPIKeyMissing) {
		t.Fatalf("expected api key missing error, got: %v", err)
	}
}

func TestOpenAIClientRetriesOnServerError(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if callCount == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"temporary"}`))
			return
		}
		_, _ = w.Write([]byte(`{
			"id":"resp_3","model":"gpt-test","output":[{"type":"message","content":[{"type":"output_text","text":"{\"intent\":\"unknown\",\"confidence\":0.5,\"language\":\"ru\",\"tool_calls\":[],\"assumptions\":[]}"}]}],
			"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}
		}`))
	}))
	defer srv.Close()

	client := NewOpenAIClient(OpenAIClientConfig{
		APIKey:     "k",
		Model:      "gpt-test",
		BaseURL:    srv.URL,
		MaxRetries: 1,
	})
	_, err := client.PlanTools(context.Background(), PlanToolsInput{SystemPrompt: "s", UserPrompt: "u"})
	if err != nil {
		t.Fatalf("unexpected error after retry: %v", err)
	}
	if callCount != 2 {
		t.Fatalf("expected 2 calls with retry, got %d", callCount)
	}
}

func TestOpenAIClientInvalidJSONPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{
			"id":"resp_4","model":"gpt-test","output":[{"type":"message","content":[{"type":"output_text","text":"not-json"}]}],
			"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}
		}`))
	}))
	defer srv.Close()

	client := NewOpenAIClient(OpenAIClientConfig{
		APIKey:  "k",
		Model:   "gpt-test",
		BaseURL: srv.URL,
	})
	_, err := client.PlanTools(context.Background(), PlanToolsInput{SystemPrompt: "s", UserPrompt: "u"})
	if err == nil {
		t.Fatalf("expected parse error")
	}
}
