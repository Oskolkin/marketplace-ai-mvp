package performance

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

func mapCampaigns(data []map[string]any) []Campaign {
	items := make([]Campaign, 0, len(data))
	for _, row := range data {
		id := firstInt64(row, "campaign_id", "id", "campaignId")
		if id == 0 {
			continue
		}
		raw, _ := json.Marshal(row)
		items = append(items, Campaign{
			CampaignExternalID: id,
			CampaignName:       firstString(row, "title", "name"),
			CampaignType:       normalizeCampaignType(firstString(row, "advObjectType", "adv_object_type")),
			PlacementType:      firstString(row, "placement"),
			Status:             firstString(row, "state", "status"),
			PaymentType:        firstString(row, "paymentType", "payment_type"),
			BudgetAmount:       normalizeMoneyString(firstString(row, "budget")),
			BudgetDaily:        normalizeMoneyString(firstString(row, "dailyBudget", "daily_budget")),
			Raw:                raw,
		})
	}
	return items
}

func mapCampaignStatistics(data []map[string]any) []CampaignDailyMetric {
	items := make([]CampaignDailyMetric, 0, len(data))
	for _, row := range data {
		campaignID := firstInt64(row, "campaign_id", "id", "campaignId")
		if campaignID == 0 {
			continue
		}
		date := parseDateFlexible(firstString(row, "date", "day", "metric_date"))
		if date.IsZero() {
			continue
		}
		raw, _ := json.Marshal(row)
		items = append(items, CampaignDailyMetric{
			CampaignExternalID: campaignID,
			MetricDate:         date,
			Impressions:        firstInt64(row, "impressions"),
			Clicks:             firstInt64(row, "clicks"),
			Spend:              normalizeMoneyString(firstString(row, "spend", "spendInRubles")),
			OrdersCount:        firstInt64(row, "orders", "ordersCount", "orders_count"),
			Revenue:            normalizeMoneyString(firstString(row, "ordersInRubles", "revenue")),
			Raw:                raw,
		})
	}
	return items
}

func mapCampaignProducts(campaignID int64, data []map[string]any) []CampaignPromotedProduct {
	items := make([]CampaignPromotedProduct, 0, len(data))
	for _, row := range data {
		sku := firstInt64(row, "sku", "id")
		if sku == 0 {
			continue
		}
		raw, _ := json.Marshal(row)
		items = append(items, CampaignPromotedProduct{
			CampaignExternalID: campaignID,
			OzonProductID:      sku,
			SKU:                sku,
			Title:              firstString(row, "title"),
			IsActive:           firstBool(row, "isActive", "is_active", "active"),
			Status:             firstString(row, "status", "state"),
			Raw:                raw,
		})
	}
	return items
}

func mapSearchPromoProducts(data []map[string]any) []CampaignPromotedProduct {
	items := make([]CampaignPromotedProduct, 0, len(data))
	for _, row := range data {
		sku := firstInt64(row, "sku")
		if sku == 0 {
			continue
		}
		hintCampaignID := int64(0)
		if hint, ok := row["hint"].(map[string]any); ok {
			hintCampaignID = firstInt64(hint, "campaignId", "campaign_id")
		}
		if hintCampaignID == 0 {
			continue
		}
		raw, _ := json.Marshal(row)
		items = append(items, CampaignPromotedProduct{
			CampaignExternalID: hintCampaignID,
			OzonProductID:      sku,
			SKU:                sku,
			Title:              firstString(row, "title"),
			IsActive:           true,
			Status:             firstString(row, "searchPromoStatus", "status"),
			Raw:                raw,
		})
	}
	return items
}

func parseDateFlexible(v string) time.Time {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Time{}
	}
	layouts := []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, v); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

func firstString(m map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := m[key]; ok && v != nil {
			switch val := v.(type) {
			case string:
				return strings.TrimSpace(val)
			case json.Number:
				return val.String()
			case float64:
				return strconv.FormatFloat(val, 'f', -1, 64)
			}
		}
	}
	return ""
}

func firstInt64(m map[string]any, keys ...string) int64 {
	for _, key := range keys {
		if v, ok := m[key]; ok && v != nil {
			switch val := v.(type) {
			case int64:
				return val
			case int32:
				return int64(val)
			case int:
				return int64(val)
			case float64:
				return int64(val)
			case json.Number:
				if i, err := val.Int64(); err == nil {
					return i
				}
			case string:
				if i, err := strconv.ParseInt(strings.TrimSpace(val), 10, 64); err == nil {
					return i
				}
			}
		}
	}
	return 0
}

func firstBool(m map[string]any, keys ...string) bool {
	for _, key := range keys {
		if v, ok := m[key]; ok && v != nil {
			switch val := v.(type) {
			case bool:
				return val
			case string:
				v := strings.ToLower(strings.TrimSpace(val))
				return v == "true" || v == "1" || v == "active"
			case float64:
				return val != 0
			}
		}
	}
	return false
}

func extractRows(raw map[string]any) []map[string]any {
	candidates := []string{"list", "products", "result", "items", "campaigns", "rows", "statistics"}
	for _, key := range candidates {
		if value, ok := raw[key]; ok {
			if rows := toMapSlice(value); len(rows) > 0 {
				return rows
			}
			// Some APIs wrap arrays one level deeper.
			if nested, ok := value.(map[string]any); ok {
				for _, inner := range candidates {
					if innerValue, exists := nested[inner]; exists {
						if rows := toMapSlice(innerValue); len(rows) > 0 {
							return rows
						}
					}
				}
			}
		}
	}
	return nil
}

func toMapSlice(v any) []map[string]any {
	array, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(array))
	for _, item := range array {
		if row, ok := item.(map[string]any); ok {
			out = append(out, row)
		}
	}
	return out
}

func normalizeCampaignType(v string) string {
	return strings.ToUpper(strings.TrimSpace(v))
}

func normalizeMoneyString(v string) string {
	normalized := strings.TrimSpace(v)
	if normalized == "" {
		return ""
	}
	normalized = strings.ReplaceAll(normalized, " ", "")
	normalized = strings.ReplaceAll(normalized, ",", ".")
	normalized = strings.ReplaceAll(normalized, "₽", "")
	normalized = strings.ReplaceAll(normalized, "RUB", "")
	normalized = strings.ReplaceAll(normalized, "rub", "")
	normalized = strings.TrimSpace(normalized)
	if normalized == "" {
		return ""
	}
	if parsed, err := strconv.ParseFloat(normalized, 64); err == nil {
		return strconv.FormatFloat(parsed, 'f', 2, 64)
	}
	return normalized
}
