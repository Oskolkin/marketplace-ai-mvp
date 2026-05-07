package chat

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	PlannerPromptVersion = "stage_10_ai_chat_planner_v1"
	AnswerPromptVersion  = "stage_10_ai_chat_answer_v1"
)

func BuildPlannerSystemPrompt(tools []ToolDefinition) string {
	blocks := make([]string, 0, len(tools))
	for _, t := range tools {
		argParts := make([]string, 0, len(t.AllowedArgs))
		argNames := make([]string, 0, len(t.AllowedArgs))
		for name := range t.AllowedArgs {
			argNames = append(argNames, name)
		}
		sort.Strings(argNames)
		for _, name := range argNames {
			arg := t.AllowedArgs[name]
			required := "optional"
			if arg.Required {
				required = "required"
			}
			allowed := ""
			if len(arg.AllowedValues) > 0 {
				allowed = fmt.Sprintf(", allowed=%s", strings.Join(arg.AllowedValues, "|"))
			}
			argParts = append(argParts, fmt.Sprintf("%s(%s,%s%s)", name, arg.Type, required, allowed))
		}
		blocks = append(blocks, fmt.Sprintf(
			"- %s: %s; args=[%s]; max_limit=%d; read_only=%t; intents=%s",
			t.Name,
			t.Purpose,
			strings.Join(argParts, ", "),
			t.MaxLimit,
			t.ReadOnly,
			joinIntents(t.SupportedIntents),
		))
	}
	return "You are a planner for marketplace assistant. Use only allowlisted read-only tools.\n" +
		"Return STRICT JSON object only (no markdown, no prose) with shape: " +
		`{"intent":"...","confidence":0-1,"language":"...","tool_calls":[{"name":"...","args":{}}],"assumptions":[],"unsupported_reason":null}` +
		"\n" + strings.Join(blocks, "\n")
}

func BuildPlannerUserPrompt(question string, asOfDate *time.Time) string {
	if asOfDate == nil {
		return fmt.Sprintf("Question: %s", question)
	}
	return fmt.Sprintf("Question: %s\nAs of date: %s", question, asOfDate.UTC().Format(time.RFC3339))
}

func BuildAnswerSystemPrompt() string {
	return "You are an assistant. Use provided fact context only. Do not claim auto-actions. " +
		"Return STRICT JSON object only (no markdown, no prose) with shape: " +
		`{"answer":"...","summary":"...","intent":"...","confidence_level":"low|medium|high","related_alert_ids":[],"related_recommendation_ids":[],"supporting_facts":[{"source":"...","id":null,"fact":"..."}],"limitations":[]}`
}

func BuildAnswerUserPrompt(ctx FactContext) string {
	raw, err := json.Marshal(ctx)
	if err != nil {
		return fmt.Sprintf("Question: %s\nIntent: %s\nTool results count: %d", ctx.Question, ctx.Intent, len(ctx.ToolResults))
	}
	return fmt.Sprintf("Fact context JSON:\n%s", string(raw))
}

func joinIntents(intents []ChatIntent) string {
	if len(intents) == 0 {
		return ""
	}
	out := make([]string, 0, len(intents))
	for _, intent := range intents {
		out = append(out, string(intent))
	}
	return strings.Join(out, "|")
}
