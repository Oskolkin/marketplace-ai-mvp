package alerts

import "testing"

func TestAdSpendWithoutResultTriggers(t *testing.T) {
	campaign := AdCampaignMetricSummary{
		CampaignExternalID: 1,
		CampaignName:       "A",
		Spend:              1200,
		Orders:             0,
		Revenue:            0,
	}
	if _, ok := evaluateAdSpendWithoutResult(baseAdvertisingInput(), campaign); !ok {
		t.Fatal("expected ad_spend_without_result")
	}
}

func TestAdSpendWithoutResultDoesNotTriggerBelowThreshold(t *testing.T) {
	campaign := AdCampaignMetricSummary{
		CampaignExternalID: 1,
		CampaignName:       "A",
		Spend:              999,
		Orders:             0,
		Revenue:            0,
	}
	if _, ok := evaluateAdSpendWithoutResult(baseAdvertisingInput(), campaign); ok {
		t.Fatal("must not trigger for spend < 1000")
	}
}

func TestAdWeakCampaignEfficiencyTriggersAtROASBelowOne(t *testing.T) {
	campaign := AdCampaignMetricSummary{
		CampaignExternalID: 2,
		CampaignName:       "B",
		Spend:              2000,
		Orders:             10,
		Revenue:            1500,
	}
	if _, ok := evaluateAdWeakCampaignEfficiency(baseAdvertisingInput(), campaign); !ok {
		t.Fatal("expected ad_weak_campaign_efficiency")
	}
}

func TestAdWeakCampaignEfficiencySkipsZeroResultOverlap(t *testing.T) {
	campaign := AdCampaignMetricSummary{
		CampaignExternalID: 2,
		CampaignName:       "B",
		Spend:              5000,
		Orders:             0,
		Revenue:            0,
	}
	if _, ok := evaluateAdWeakCampaignEfficiency(baseAdvertisingInput(), campaign); ok {
		t.Fatal("must skip weak efficiency when revenue is zero")
	}
}

func TestAdBudgetOnLowStockSKUTriggersByDaysOfCover(t *testing.T) {
	days := 6.0
	sku := baseAdSKU()
	sku.DaysOfCover = &days
	sku.CurrentStock = 12

	campaign := AdCampaignMetricSummary{CampaignExternalID: 10, CampaignName: "X", Spend: 500}
	link := AdCampaignSKUMapping{CampaignExternalID: 10, OzonProductID: sku.OzonProductID, IsActive: true}

	if _, ok := evaluateAdBudgetOnLowStockSKU(baseAdvertisingInput(), campaign, link, sku); !ok {
		t.Fatal("expected ad_budget_on_low_stock_sku by days_of_cover")
	}
}

func TestAdBudgetOnLowStockSKUTriggersByZeroStock(t *testing.T) {
	sku := baseAdSKU()
	sku.CurrentStock = 0
	sku.DaysOfCover = nil

	campaign := AdCampaignMetricSummary{CampaignExternalID: 10, CampaignName: "X", Spend: 500}
	link := AdCampaignSKUMapping{CampaignExternalID: 10, OzonProductID: sku.OzonProductID, IsActive: true}

	rr, ok := evaluateAdBudgetOnLowStockSKU(baseAdvertisingInput(), campaign, link, sku)
	if !ok {
		t.Fatal("expected ad_budget_on_low_stock_sku by stock")
	}
	if rr.Urgency != UrgencyImmediate {
		t.Fatalf("expected immediate urgency, got %s", rr.Urgency)
	}
}

func TestEvaluateAdvertisingRulesNoDataNoPanic(t *testing.T) {
	in := baseAdvertisingInput()
	res := EvaluateAdvertisingRules(in)
	if len(res.RuleResults) != 0 {
		t.Fatalf("expected no alerts, got %d", len(res.RuleResults))
	}
}

func baseAdvertisingInput() AdvertisingRuleEvaluationInput {
	return AdvertisingRuleEvaluationInput{
		SellerAccountID:   1,
		DateFrom:          "2026-04-24",
		DateTo:            "2026-04-30",
		AsOfDate:          "2026-04-30",
		CampaignSummaries: nil,
		CampaignSKULinks:  nil,
		SKUMetrics:        nil,
	}
}

func baseAdSKU() SKUDailyMetric {
	sku := int64(321)
	offer := "offer-321"
	name := "Ad SKU"
	return SKUDailyMetric{
		SellerAccountID: 1,
		OzonProductID:   999,
		SKU:             &sku,
		OfferID:         &offer,
		ProductName:     &name,
		Revenue:         1000,
		OrdersCount:     3,
	}
}
