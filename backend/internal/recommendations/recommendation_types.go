package recommendations

import (
	"strings"
	"sync"
)

// CanonicalRecommendationTypes is the single MVP allowlist for recommendation_type
// (validator, prompt, and OpenAI schema must use this list only).
var CanonicalRecommendationTypes = []string{
	"replenish_sku",
	"review_ad_spend",
	"pause_or_reduce_ads",
	"avoid_ads_for_low_stock_sku",
	"investigate_sales_drop",
	"review_price_margin",
	"review_price_floor",
	"discount_overstock",
	"monitor_sku",
	"account_priority_review",
}

var (
	canonicalRecommendationTypeSet map[string]struct{}
	recommendationTypeAliasToCanon map[string]string
	recommendationTypesOnce        sync.Once
)

// TypeNormalizationEntry records alias → canonical mapping for one candidate index.
type TypeNormalizationEntry struct {
	Index     int    `json:"index"`
	Original  string `json:"original"`
	Canonical string `json:"canonical"`
}

func initRecommendationTypes() {
	canonicalRecommendationTypeSet = make(map[string]struct{}, len(CanonicalRecommendationTypes))
	for _, t := range CanonicalRecommendationTypes {
		canonicalRecommendationTypeSet[t] = struct{}{}
	}

	aliases := map[string]string{
		// Stock / replenishment (AI synonyms)
		"stock_replenishment":       "replenish_sku",
		"inventory_replenishment":   "replenish_sku",
		"replenish_stock":           "replenish_sku",
		"restock_sku":               "replenish_sku",
		"restock_product":           "replenish_sku",
		"low_stock_replenishment":   "replenish_sku",
		// Legacy validator types → canonical
		"prioritize_key_sku_replenishment": "replenish_sku",

		// Advertising spend review
		"ad_spend_review":                 "review_ad_spend",
		"review_ads":                      "review_ad_spend",
		"advertising_review":              "review_ad_spend",
		"ad_budget_review":                "review_ad_spend",
		"low_roas_review":                 "review_ad_spend",
		"review_campaign_without_result":  "review_ad_spend",

		// Pause / reduce ads
		"reduce_ad_spend":                  "pause_or_reduce_ads",
		"pause_ads":                        "pause_or_reduce_ads",
		"reduce_ads":                       "pause_or_reduce_ads",
		"reduce_or_pause_inefficient_campaign": "pause_or_reduce_ads",

		// Low-stock + ads
		"reduce_ad_spend_for_low_stock":        "avoid_ads_for_low_stock_sku",
		"low_stock_ad_risk":                    "avoid_ads_for_low_stock_sku",
		"avoid_low_stock_ads":                  "avoid_ads_for_low_stock_sku",
		"stop_ads_low_stock":                   "avoid_ads_for_low_stock_sku",
		"redirect_ad_budget_from_low_stock_sku": "avoid_ads_for_low_stock_sku",
		"reduce_ads_until_stock_recovers":      "avoid_ads_for_low_stock_sku",
		"rebalance_ads_and_stock":              "avoid_ads_for_low_stock_sku",

		// Sales / revenue decline
		"sales_drop_investigation":          "investigate_sales_drop",
		"investigate_revenue_drop":          "investigate_sales_drop",
		"sales_decline_review":              "investigate_sales_drop",
		"revenue_drop_review":               "investigate_sales_drop",
		"investigate_sku_drop":              "investigate_sales_drop",
		"focus_on_negative_contributor_sku": "investigate_sales_drop",

		// Margin / pricing economics
		"price_review":          "review_price_margin",
		"pricing_review":        "review_price_margin",
		"margin_review":         "review_price_margin",
		"review_margin":         "review_price_margin",
		"price_margin_review":   "review_price_margin",
		"review_margin_risk":    "review_price_margin",
		"review_price_above_max": "review_price_margin",
		"review_price_and_ads_for_sku": "review_price_margin",

		// Price floor / min price
		"price_floor_review":                "review_price_floor",
		"min_price_review":                  "review_price_floor",
		"price_constraint_review":           "review_price_floor",
		"review_price_below_min":            "review_price_floor",
		"add_pricing_constraints_for_key_sku": "review_price_floor",

		// Overstock
		"overstock_discount":      "discount_overstock",
		"discount_overstock_sku":  "discount_overstock",
		"overstock_promo":         "discount_overstock",
		"clear_overstock":         "discount_overstock",

		// Monitor
		"monitor_product": "monitor_sku",
		"watch_sku":       "monitor_sku",

		// Account priority
		"account_review":          "account_priority_review",
		"daily_priority_review":   "account_priority_review",
		"prioritize_sku_recovery_plan": "account_priority_review",
	}

	recommendationTypeAliasToCanon = make(map[string]string, len(aliases)+len(CanonicalRecommendationTypes))
	for alias, canon := range aliases {
		recommendationTypeAliasToCanon[normalizeRecommendationTypeKey(alias)] = canon
	}
	for _, canon := range CanonicalRecommendationTypes {
		recommendationTypeAliasToCanon[normalizeRecommendationTypeKey(canon)] = canon
	}
}

func normalizeRecommendationTypeKey(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	s = strings.ReplaceAll(s, "-", "_")
	s = strings.Join(strings.Fields(s), "_")
	return s
}

// IsCanonicalRecommendationType reports whether t is in the MVP allowlist.
func IsCanonicalRecommendationType(t string) bool {
	recommendationTypesOnce.Do(initRecommendationTypes)
	_, ok := canonicalRecommendationTypeSet[normalizeRecommendationTypeKey(t)]
	return ok
}

// NormalizeRecommendationType maps aliases and legacy types to a canonical recommendation_type.
// Returns canonical value, whether it differed from the normalized input key, and ok=false for unknown types.
func NormalizeRecommendationType(raw string) (canonical string, changed bool, ok bool) {
	recommendationTypesOnce.Do(initRecommendationTypes)
	key := normalizeRecommendationTypeKey(raw)
	if key == "" {
		return "", false, false
	}
	canon, found := recommendationTypeAliasToCanon[key]
	if !found {
		return "", false, false
	}
	return canon, canon != key, true
}

// AllowedRecommendationTypesPromptLines returns bullet lines for system/user prompts.
func AllowedRecommendationTypesPromptLines() []string {
	lines := make([]string, len(CanonicalRecommendationTypes))
	for i, t := range CanonicalRecommendationTypes {
		lines[i] = "- " + t
	}
	return lines
}

// CanonicalRecommendationTypesJSONSchemaEnum returns a copy of canonical types for OpenAI json_schema enums.
func CanonicalRecommendationTypesJSONSchemaEnum() []string {
	out := make([]string, len(CanonicalRecommendationTypes))
	copy(out, CanonicalRecommendationTypes)
	return out
}
