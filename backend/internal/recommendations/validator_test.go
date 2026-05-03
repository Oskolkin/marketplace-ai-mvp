package recommendations

import (
	"strings"
	"testing"
	"time"
)

func TestOutputValidatorValidate_SuccessEnvelope(t *testing.T) {
	v := NewOutputValidator()
	content := `{
		"recommendations": [
			{
				"recommendation_type":"replenish_sku",
				"horizon":"short_term",
				"entity_type":"sku",
				"entity_sku":1001,
				"title":"Пополнить SKU",
				"what_happened":"Снижается остаток",
				"why_it_matters":"Риск OOS",
				"recommended_action":"Увеличить поставку",
				"expected_effect":"Стабилизировать продажи",
				"priority_score":88.5,
				"priority_level":"high",
				"urgency":"immediate",
				"confidence_level":"high",
				"supporting_metrics":{"stock_available":0},
				"constraints_checked":{"stock_checked":true},
				"supporting_alert_ids":[101],
				"related_alert_types":["stock_oos_risk"]
			}
		]
	}`
	out := &GenerateRecommendationsOutput{Content: content}
	ctx := sampleContext()

	res, err := v.Validate(out, ctx)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if len(res.ValidRecommendations) != 1 {
		t.Fatalf("expected 1 valid recommendation, got %d", len(res.ValidRecommendations))
	}
	if len(res.RejectedRecommendations) != 0 {
		t.Fatalf("expected 0 rejected recommendations, got %d", len(res.RejectedRecommendations))
	}
}

func TestOutputValidatorValidate_InvalidRecommendationTypeRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{
			"recommendation_type":"not_allowed_type",
			"horizon":"medium_term",
			"entity_type":"account",
			"title":"Оптимизировать воронку",
			"what_happened":"Конверсия падает",
			"why_it_matters":"Теряется выручка",
			"recommended_action":"Пересмотреть трафик",
			"priority_score":64,
			"priority_level":"medium",
			"urgency":"medium",
			"confidence_level":"medium",
			"supporting_metrics":{"orders_delta":-0.2},
			"constraints_checked":{"ads_checked":true}
		}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 {
		t.Fatalf("expected rejection")
	}
}

func TestOutputValidatorValidate_EmptySupportingMetricsRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"replenish_sku","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"t","what_happened":"w","why_it_matters":"y","recommended_action":"a","priority_score":10,"priority_level":"low","urgency":"low","confidence_level":"low","supporting_metrics":{},"constraints_checked":{"stock_checked":true}}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 {
		t.Fatalf("expected rejection")
	}
}

func TestOutputValidatorValidate_EmptyConstraintsCheckedRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"replenish_sku","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"t","what_happened":"w","why_it_matters":"y","recommended_action":"a","priority_score":10,"priority_level":"low","urgency":"low","confidence_level":"low","supporting_metrics":{"stock_available":0},"constraints_checked":{}}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 {
		t.Fatalf("expected rejection")
	}
}

func TestOutputValidatorValidate_UnknownSKURejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"replenish_sku","horizon":"short_term","entity_type":"sku","entity_sku":999999,"title":"t","what_happened":"w","why_it_matters":"y","recommended_action":"a","priority_score":10,"priority_level":"low","urgency":"low","confidence_level":"low","supporting_metrics":{"stock_available":0},"constraints_checked":{"stock_checked":true}}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 {
		t.Fatalf("expected rejection")
	}
}

func TestOutputValidatorValidate_PriceBelowMinRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"review_price_below_min","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"Снизить цену","what_happened":"w","why_it_matters":"y","recommended_action":"снизить цену до 50","priority_score":50,"priority_level":"high","urgency":"high","confidence_level":"high","supporting_metrics":{"expected_margin":0.2},"constraints_checked":{"pricing_checked":true,"margin_checked":true}}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 || !strings.Contains(res.RejectedRecommendations[0].Reason, "below effective_min_price") {
		t.Fatalf("expected below min rejection: %+v", res.RejectedRecommendations)
	}
}

func TestOutputValidatorValidate_PriceAboveMaxRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"review_price_above_max","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"Поднять цену","what_happened":"w","why_it_matters":"y","recommended_action":"повысить цену до 300","priority_score":50,"priority_level":"high","urgency":"high","confidence_level":"high","supporting_metrics":{"expected_margin":0.2},"constraints_checked":{"pricing_checked":true,"margin_checked":true}}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 || !strings.Contains(res.RejectedRecommendations[0].Reason, "above effective_max_price") {
		t.Fatalf("expected above max rejection")
	}
}

func TestOutputValidatorValidate_IncreaseAdsLowStockRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"redirect_ad_budget_from_low_stock_sku","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"Ads","what_happened":"w","why_it_matters":"y","recommended_action":"увеличить рекламу и увеличить бюджет","priority_score":70,"priority_level":"high","urgency":"high","confidence_level":"high","supporting_metrics":{"ctr":0.1},"constraints_checked":{"ads_checked":true,"stock_checked":true},"related_alert_types":["stock_oos_risk"]}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 {
		t.Fatalf("expected rejection")
	}
}

func TestOutputValidatorValidate_MarginRiskWithoutCheckRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"review_margin_risk","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"Price","what_happened":"w","why_it_matters":"y","recommended_action":"reduce price to 120","priority_score":60,"priority_level":"high","urgency":"high","confidence_level":"high","supporting_metrics":{"expected_margin":0.09},"constraints_checked":{"pricing_checked":true},"related_alert_types":["margin_risk_at_current_price"]}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 || !strings.Contains(res.RejectedRecommendations[0].Reason, "margin_checked") {
		t.Fatalf("expected margin_checked rejection")
	}
}

func TestOutputValidatorValidate_MarginRiskVeryLowRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"review_margin_risk","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"Price","what_happened":"w","why_it_matters":"y","recommended_action":"reduce price to 120","priority_score":60,"priority_level":"high","urgency":"high","confidence_level":"high","supporting_metrics":{"expected_margin":0.04},"constraints_checked":{"pricing_checked":true,"margin_checked":true},"related_alert_types":["margin_risk_at_current_price"]}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 || !strings.Contains(res.RejectedRecommendations[0].Reason, "below 0.05") {
		t.Fatalf("expected expected_margin rejection")
	}
}

func TestOutputValidatorValidate_RelatedAlertTypesMismatchRejected(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"replenish_sku","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"t","what_happened":"w","why_it_matters":"y","recommended_action":"a","priority_score":10,"priority_level":"low","urgency":"low","confidence_level":"low","supporting_metrics":{"stock_available":0},"constraints_checked":{"stock_checked":true},"supporting_alert_ids":[101],"related_alert_types":["ad_spend_without_result"]}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RejectedRecommendations) != 1 {
		t.Fatalf("expected rejection")
	}
}

func TestOutputValidatorValidate_WarningDowngradesConfidence(t *testing.T) {
	v := NewOutputValidator()
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"review_campaign_without_result","horizon":"short_term","entity_type":"campaign","entity_id":"555","title":"ad","what_happened":"w","why_it_matters":"y","recommended_action":"optimize campaign","priority_score":50,"priority_level":"high","urgency":"high","confidence_level":"high","supporting_metrics":{"roas":0.2},"constraints_checked":{"stock_checked":true}}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.ValidRecommendations) != 1 {
		t.Fatalf("expected valid recommendation with warning")
	}
	if res.ValidRecommendations[0].FinalConfidenceLevel != "medium" {
		t.Fatalf("expected downgraded confidence, got %s", res.ValidRecommendations[0].FinalConfidenceLevel)
	}
	if len(res.ValidRecommendations[0].Warnings) == 0 {
		t.Fatalf("expected warnings")
	}
}

func TestOutputValidatorValidate_SanitizationTrimCapDedupe(t *testing.T) {
	v := NewOutputValidator()
	long := strings.Repeat("x", 300)
	out := &GenerateRecommendationsOutput{
		Content: `{"recommendations":[{"recommendation_type":"replenish_sku","horizon":"short_term","entity_type":"sku","entity_sku":1001,"title":"   ` + long + `   ","what_happened":"  ` + strings.Repeat("w", 1200) + `","why_it_matters":" ` + strings.Repeat("y", 1200) + ` ","recommended_action":" ` + strings.Repeat("a", 1700) + ` ","expected_effect":" ` + strings.Repeat("e", 1200) + ` ","priority_score":10,"priority_level":"low","urgency":"low","confidence_level":"low","supporting_metrics":{"stock_available":0},"constraints_checked":{"stock_checked":true},"supporting_alert_ids":[101,101],"related_alert_types":["stock_oos_risk","stock_oos_risk"]}]}`,
	}
	res, err := v.Validate(out, sampleContext())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.ValidRecommendations) != 1 {
		t.Fatalf("expected valid recommendation")
	}
	got := res.ValidRecommendations[0].Recommendation
	if len(got.Title) != 200 || len(got.WhatHappened) != 1000 || len(got.WhyItMatters) != 1000 || len(got.RecommendedAction) != 1500 || len(*got.ExpectedEffect) != 1000 {
		t.Fatalf("expected capped field lengths")
	}
	if len(got.SupportingAlertIDs) != 1 || len(got.RelatedAlertTypes) != 1 {
		t.Fatalf("expected deduped ids/types")
	}
}

func sampleContext() *AIRecommendationContext {
	offer := "offer-1"
	sku := int64(1001)
	doc := 3.0
	minP := 100.0
	maxP := 200.0
	return &AIRecommendationContext{
		GeneratedAt: time.Now().UTC(),
		Alerts: AlertsContext{
			TopOpen: []AlertSignal{
				{ID: 101, AlertType: "stock_oos_risk", EntitySKU: &sku, EntityOfferID: &offer},
				{ID: 102, AlertType: "margin_risk_at_current_price", EntitySKU: &sku},
				{ID: 103, AlertType: "review_campaign_without_result", EntityID: strPtr("555")},
				{ID: 104, AlertType: "missing_pricing_constraints_for_key_sku", EntitySKU: &sku},
			},
		},
		Merchandising: MerchandisingContext{
			TopRevenueSKUs: []SKUDailyMetric{{OzonProductID: 1001, SKU: &sku, OfferID: &offer, StockAvailable: 2, DaysOfCover: &doc}},
			LowStockSKUs:   []SKUDailyMetric{{OzonProductID: 1001, SKU: &sku, OfferID: &offer, StockAvailable: 0, DaysOfCover: &doc}},
		},
		Pricing: PricingContext{
			TopConstrainedSKUs: []EffectiveConstraint{{
				OzonProductID:     1001,
				SKU:               &sku,
				OfferID:           &offer,
				EffectiveMinPrice: &minP,
				EffectiveMaxPrice: &maxP,
			}},
		},
		Advertising: AdvertisingContext{
			TopCampaigns: []AdCampaignSummary{{CampaignExternalID: 555}},
		},
	}
}

func strPtr(s string) *string { return &s }

func TestOutputValidatorValidate_ParseError(t *testing.T) {
	v := NewOutputValidator()
	_, err := v.Validate(&GenerateRecommendationsOutput{Content: `not-json`}, nil)
	if err == nil {
		t.Fatalf("expected parse error")
	}
}

func TestOutputValidatorValidate_ErrorsOnNilInput(t *testing.T) {
	v := NewOutputValidator()
	_, err := v.Validate(nil, nil)
	if err == nil {
		t.Fatalf("expected error")
	}
}
