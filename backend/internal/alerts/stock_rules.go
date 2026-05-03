package alerts

import "fmt"

const (
	stockLowCoverageThresholdDays = 7.0
	stockOOSRiskThresholdDays     = 3.0

	keySKURevenueThreshold = 10000.0
	keySKUOrdersThreshold  = 5
)

type StockRuleEvaluationInput struct {
	SellerAccountID int64
	AsOfDate        string
	SKUMetrics      []SKUDailyMetric
}

type StockRuleEvaluationResult struct {
	RuleResults []RuleResult
	Skipped     int
}

func EvaluateStockRules(input StockRuleEvaluationInput) StockRuleEvaluationResult {
	if len(input.SKUMetrics) == 0 {
		return StockRuleEvaluationResult{RuleResults: nil, Skipped: 1}
	}

	results := make([]RuleResult, 0)
	skipped := 0

	for _, sku := range input.SKUMetrics {
		if rr, ok := evaluateStockOOSRisk(input, sku); ok {
			results = append(results, rr)
		} else {
			skipped++
		}
		// To reduce semantic duplicates we skip low_coverage alert for <=3 DoC,
		// because oos_risk already captures this more urgent state.
		if rr, ok := evaluateStockLowCoverage(input, sku); ok {
			results = append(results, rr)
		} else {
			skipped++
		}
		if rr, ok := evaluateStockCriticalSKULowStock(input, sku); ok {
			results = append(results, rr)
		} else {
			skipped++
		}
	}

	return StockRuleEvaluationResult{
		RuleResults: results,
		Skipped:     skipped,
	}
}

func evaluateStockLowCoverage(input StockRuleEvaluationInput, sku SKUDailyMetric) (RuleResult, bool) {
	if sku.CurrentStock <= 0 || sku.DaysOfCover == nil {
		return RuleResult{}, false
	}
	days := *sku.DaysOfCover
	if days > stockLowCoverageThresholdDays || days <= stockOOSRiskThresholdDays {
		return RuleResult{}, false
	}

	entityID := fmt.Sprintf("%d", sku.OzonProductID)
	return RuleResult{
		AlertType:     AlertTypeStockLowCoverage,
		AlertGroup:    AlertGroupStock,
		EntityType:    EntityTypeSKU,
		EntityID:      &entityID,
		EntitySKU:     sku.SKU,
		EntityOfferID: sku.OfferID,
		Title:         "Низкий горизонт покрытия остатка",
		Message:       "Остатка по SKU может хватить менее чем на неделю.",
		Severity:      severityForLowCoverage(days),
		Urgency:       urgencyForLowCoverage(days),
		EvidencePayload: BuildStockEvidence(days, int64(sku.CurrentStock), 0, EvidencePayload{
			"metric":                  "days_of_cover",
			"sku":                     sku.SKU,
			"offer_id":                sku.OfferID,
			"product_id":              sku.OzonProductID,
			"ozon_product_id":         sku.OzonProductID,
			"product_name":            sku.ProductName,
			"current_stock":           sku.CurrentStock,
			"days_of_cover":           days,
			"threshold_days_of_cover": stockLowCoverageThresholdDays,
			"as_of_date":              input.AsOfDate,
		}),
	}, true
}

func evaluateStockOOSRisk(input StockRuleEvaluationInput, sku SKUDailyMetric) (RuleResult, bool) {
	triggerReason := ""
	if sku.CurrentStock <= 0 {
		triggerReason = "zero_or_negative_stock"
	} else if sku.DaysOfCover != nil && *sku.DaysOfCover <= stockOOSRiskThresholdDays {
		triggerReason = "low_days_of_cover"
	} else {
		return RuleResult{}, false
	}

	entityID := fmt.Sprintf("%d", sku.OzonProductID)
	days := 0.0
	if sku.DaysOfCover != nil {
		days = *sku.DaysOfCover
	}
	return RuleResult{
		AlertType:     AlertTypeStockOOSRisk,
		AlertGroup:    AlertGroupStock,
		EntityType:    EntityTypeSKU,
		EntityID:      &entityID,
		EntitySKU:     sku.SKU,
		EntityOfferID: sku.OfferID,
		Title:         "Риск out-of-stock",
		Message:       "SKU находится в зоне высокого риска дефицита или уже закончился.",
		Severity:      severityForOOSRisk(sku.CurrentStock, sku.DaysOfCover),
		Urgency:       urgencyForOOSRisk(sku.CurrentStock, sku.DaysOfCover),
		EvidencePayload: BuildStockEvidence(days, int64(sku.CurrentStock), 0, EvidencePayload{
			"metric":                  "stock_oos_risk",
			"sku":                     sku.SKU,
			"offer_id":                sku.OfferID,
			"product_id":              sku.OzonProductID,
			"ozon_product_id":         sku.OzonProductID,
			"product_name":            sku.ProductName,
			"current_stock":           sku.CurrentStock,
			"days_of_cover":           sku.DaysOfCover,
			"threshold_days_of_cover": stockOOSRiskThresholdDays,
			"as_of_date":              input.AsOfDate,
			"trigger_reason":          triggerReason,
		}),
	}, true
}

func evaluateStockCriticalSKULowStock(input StockRuleEvaluationInput, sku SKUDailyMetric) (RuleResult, bool) {
	keyReason := ""
	if sku.Revenue >= keySKURevenueThreshold {
		keyReason = "revenue_threshold"
	} else if sku.OrdersCount >= keySKUOrdersThreshold {
		keyReason = "orders_threshold"
	} else {
		return RuleResult{}, false
	}

	lowStock := sku.CurrentStock <= 0
	if !lowStock && (sku.DaysOfCover == nil || *sku.DaysOfCover > stockLowCoverageThresholdDays) {
		return RuleResult{}, false
	}

	entityID := fmt.Sprintf("%d", sku.OzonProductID)
	days := 0.0
	if sku.DaysOfCover != nil {
		days = *sku.DaysOfCover
	}
	return RuleResult{
		AlertType:     AlertTypeStockCriticalSKULowStock,
		AlertGroup:    AlertGroupStock,
		EntityType:    EntityTypeSKU,
		EntityID:      &entityID,
		EntitySKU:     sku.SKU,
		EntityOfferID: sku.OfferID,
		Title:         "Ключевой SKU с низким остатком",
		Message:       "Значимый SKU имеет низкий остаток и может привести к потере продаж.",
		Severity:      severityForCriticalSKULowStock(sku.CurrentStock, sku.DaysOfCover),
		Urgency:       urgencyForCriticalSKULowStock(sku.CurrentStock, sku.DaysOfCover),
		EvidencePayload: BuildStockEvidence(days, int64(sku.CurrentStock), 0, EvidencePayload{
			"metric":                  "key_sku_stock",
			"sku":                     sku.SKU,
			"offer_id":                sku.OfferID,
			"product_id":              sku.OzonProductID,
			"ozon_product_id":         sku.OzonProductID,
			"product_name":            sku.ProductName,
			"current_stock":           sku.CurrentStock,
			"days_of_cover":           sku.DaysOfCover,
			"revenue":                 sku.Revenue,
			"orders_count":            sku.OrdersCount,
			"is_key_sku":              true,
			"key_sku_reason":          keyReason,
			"threshold_days_of_cover": stockLowCoverageThresholdDays,
			"as_of_date":              input.AsOfDate,
		}),
	}, true
}

func severityForLowCoverage(days float64) Severity {
	if days < 2 {
		return SeverityCritical
	}
	if days <= 3 {
		return SeverityHigh
	}
	return SeverityMedium
}

func urgencyForLowCoverage(days float64) Urgency {
	if days <= 3 {
		return UrgencyHigh
	}
	return UrgencyMedium
}

func severityForOOSRisk(currentStock int32, daysOfCover *float64) Severity {
	if currentStock <= 0 {
		return SeverityCritical
	}
	if daysOfCover != nil && *daysOfCover < 1 {
		return SeverityCritical
	}
	return SeverityHigh
}

func urgencyForOOSRisk(currentStock int32, daysOfCover *float64) Urgency {
	if currentStock <= 0 {
		return UrgencyImmediate
	}
	if daysOfCover != nil && *daysOfCover <= stockOOSRiskThresholdDays {
		return UrgencyHigh
	}
	return UrgencyMedium
}

func severityForCriticalSKULowStock(currentStock int32, daysOfCover *float64) Severity {
	if currentStock <= 0 {
		return SeverityCritical
	}
	if daysOfCover != nil && *daysOfCover <= stockOOSRiskThresholdDays {
		return SeverityCritical
	}
	return SeverityHigh
}

func urgencyForCriticalSKULowStock(currentStock int32, daysOfCover *float64) Urgency {
	if currentStock <= 0 {
		return UrgencyImmediate
	}
	if daysOfCover != nil && *daysOfCover <= stockOOSRiskThresholdDays {
		return UrgencyHigh
	}
	return UrgencyHigh
}
