package alerts

import "fmt"

const (
	adSpendWithoutResultThreshold = 1000.0
	adWeakROASThreshold           = 1.0
	adLowStockThresholdDays       = 7.0
)

type AdvertisingRuleEvaluationInput struct {
	SellerAccountID   int64
	DateFrom          string
	DateTo            string
	AsOfDate          string
	CampaignSummaries []AdCampaignMetricSummary
	CampaignSKULinks  []AdCampaignSKUMapping
	SKUMetrics        []SKUDailyMetric
}

type AdvertisingRuleEvaluationResult struct {
	RuleResults []RuleResult
	Skipped     int
}

func EvaluateAdvertisingRules(input AdvertisingRuleEvaluationInput) AdvertisingRuleEvaluationResult {
	results := make([]RuleResult, 0)
	skipped := 0

	for _, campaign := range input.CampaignSummaries {
		if rr, ok := evaluateAdSpendWithoutResult(input, campaign); ok {
			results = append(results, rr)
		} else {
			skipped++
		}
		if rr, ok := evaluateAdWeakCampaignEfficiency(input, campaign); ok {
			results = append(results, rr)
		} else {
			skipped++
		}
	}

	campaignByID := make(map[int64]AdCampaignMetricSummary, len(input.CampaignSummaries))
	for _, c := range input.CampaignSummaries {
		campaignByID[c.CampaignExternalID] = c
	}
	skuByProductID := make(map[int64]SKUDailyMetric, len(input.SKUMetrics))
	for _, sku := range input.SKUMetrics {
		skuByProductID[sku.OzonProductID] = sku
	}

	for _, link := range input.CampaignSKULinks {
		campaign, ok := campaignByID[link.CampaignExternalID]
		if !ok || campaign.Spend <= 0 || !link.IsActive {
			skipped++
			continue
		}
		sku, ok := skuByProductID[link.OzonProductID]
		if !ok {
			skipped++
			continue
		}
		if rr, ok := evaluateAdBudgetOnLowStockSKU(input, campaign, link, sku); ok {
			results = append(results, rr)
		} else {
			skipped++
		}
	}

	return AdvertisingRuleEvaluationResult{RuleResults: results, Skipped: skipped}
}

func evaluateAdSpendWithoutResult(input AdvertisingRuleEvaluationInput, campaign AdCampaignMetricSummary) (RuleResult, bool) {
	if campaign.Spend < adSpendWithoutResultThreshold {
		return RuleResult{}, false
	}
	if campaign.Orders > 0 && campaign.Revenue > 0 {
		return RuleResult{}, false
	}
	entityID := fmt.Sprintf("%d", campaign.CampaignExternalID)
	sev := severityForAdSpendWithoutResult(campaign.Spend)
	return RuleResult{
		AlertType:  AlertTypeAdSpendWithoutResult,
		AlertGroup: AlertGroupAdvertising,
		EntityType: EntityTypeCampaign,
		EntityID:   &entityID,
		Title:      "Рекламный расход без результата",
		Message:    "Кампания тратит бюджет, но не даёт подтверждённых заказов или выручки.",
		Severity:   sev,
		Urgency:    urgencyForAdSeverity(sev),
		EvidencePayload: BuildAdvertisingEvidence(campaign.Spend, 0, campaign.Orders, campaign.Revenue, 0, EvidencePayload{
			"metric":               "ad_spend_without_result",
			"campaign_id":          campaign.CampaignExternalID,
			"campaign_external_id": campaign.CampaignExternalID,
			"campaign_name":        campaign.CampaignName,
			"campaign_type":        campaign.CampaignType,
			"spend":                campaign.Spend,
			"orders":               campaign.Orders,
			"revenue":              campaign.Revenue,
			"threshold_spend":      adSpendWithoutResultThreshold,
			"date_from":            input.DateFrom,
			"date_to":              input.DateTo,
		}),
	}, true
}

func evaluateAdWeakCampaignEfficiency(input AdvertisingRuleEvaluationInput, campaign AdCampaignMetricSummary) (RuleResult, bool) {
	if campaign.Spend <= 0 || campaign.Revenue <= 0 {
		return RuleResult{}, false
	}
	roas := campaign.Revenue / campaign.Spend
	if roas >= adWeakROASThreshold {
		return RuleResult{}, false
	}
	entityID := fmt.Sprintf("%d", campaign.CampaignExternalID)
	sev := severityForAdROAS(roas)
	return RuleResult{
		AlertType:  AlertTypeAdWeakCampaignEfficiency,
		AlertGroup: AlertGroupAdvertising,
		EntityType: EntityTypeCampaign,
		EntityID:   &entityID,
		Title:      "Слабая эффективность рекламной кампании",
		Message:    "Подтверждённая выручка по кампании ниже рекламного расхода.",
		Severity:   sev,
		Urgency:    urgencyForAdSeverity(sev),
		EvidencePayload: BuildAdvertisingEvidence(campaign.Spend, 0, campaign.Orders, campaign.Revenue, 0, EvidencePayload{
			"metric":               "ad_roas",
			"campaign_id":          campaign.CampaignExternalID,
			"campaign_external_id": campaign.CampaignExternalID,
			"campaign_name":        campaign.CampaignName,
			"campaign_type":        campaign.CampaignType,
			"spend":                campaign.Spend,
			"revenue":              campaign.Revenue,
			"orders":               campaign.Orders,
			"roas":                 roas,
			"threshold_roas":       adWeakROASThreshold,
			"date_from":            input.DateFrom,
			"date_to":              input.DateTo,
		}),
	}, true
}

func evaluateAdBudgetOnLowStockSKU(input AdvertisingRuleEvaluationInput, campaign AdCampaignMetricSummary, link AdCampaignSKUMapping, sku SKUDailyMetric) (RuleResult, bool) {
	lowStock := sku.CurrentStock <= 0
	lowCoverage := sku.DaysOfCover != nil && *sku.DaysOfCover <= adLowStockThresholdDays
	if !lowStock && !lowCoverage {
		return RuleResult{}, false
	}
	entityID := fmt.Sprintf("%d", sku.OzonProductID)
	sev := severityForAdBudgetOnLowStock(sku.CurrentStock, sku.DaysOfCover)
	return RuleResult{
		AlertType:     AlertTypeAdBudgetOnLowStockSKU,
		AlertGroup:    AlertGroupAdvertising,
		EntityType:    EntityTypeSKU,
		EntityID:      &entityID,
		EntitySKU:     sku.SKU,
		EntityOfferID: sku.OfferID,
		Title:         "Реклама ведёт на SKU с низким остатком",
		Message:       "SKU участвует в рекламе, но имеет риск дефицита.",
		Severity:      sev,
		Urgency:       urgencyForAdBudgetOnLowStock(sku.CurrentStock, sku.DaysOfCover),
		EvidencePayload: BuildAdvertisingEvidence(campaign.Spend, 0, campaign.Orders, campaign.Revenue, 0, EvidencePayload{
			"metric":                  "ad_budget_on_low_stock_sku",
			"sku":                     sku.SKU,
			"offer_id":                sku.OfferID,
			"product_id":              sku.OzonProductID,
			"ozon_product_id":         sku.OzonProductID,
			"product_name":            sku.ProductName,
			"campaign_id":             campaign.CampaignExternalID,
			"campaign_external_id":    campaign.CampaignExternalID,
			"campaign_name":           campaign.CampaignName,
			"spend":                   campaign.Spend,
			"current_stock":           sku.CurrentStock,
			"days_of_cover":           sku.DaysOfCover,
			"threshold_days_of_cover": adLowStockThresholdDays,
			"date_from":               input.DateFrom,
			"date_to":                 input.DateTo,
			"as_of_date":              input.AsOfDate,
		}),
	}, true
}

func severityForAdSpendWithoutResult(spend float64) Severity {
	if spend >= 10000 {
		return SeverityCritical
	}
	if spend >= 3000 {
		return SeverityHigh
	}
	return SeverityMedium
}

func severityForAdROAS(roas float64) Severity {
	if roas < 0.3 {
		return SeverityCritical
	}
	if roas < 0.75 {
		return SeverityHigh
	}
	return SeverityMedium
}

func severityForAdBudgetOnLowStock(currentStock int32, daysOfCover *float64) Severity {
	if currentStock <= 0 {
		return SeverityCritical
	}
	if daysOfCover != nil && *daysOfCover <= 3 {
		return SeverityHigh
	}
	return SeverityMedium
}

func urgencyForAdSeverity(severity Severity) Urgency {
	if severity == SeverityCritical || severity == SeverityHigh {
		return UrgencyHigh
	}
	return UrgencyMedium
}

func urgencyForAdBudgetOnLowStock(currentStock int32, daysOfCover *float64) Urgency {
	if currentStock <= 0 {
		return UrgencyImmediate
	}
	if daysOfCover != nil && *daysOfCover <= 3 {
		return UrgencyHigh
	}
	return UrgencyMedium
}
