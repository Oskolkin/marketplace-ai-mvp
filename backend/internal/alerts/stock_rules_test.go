package alerts

import "testing"

func TestStockLowCoverageTriggersAtSevenDays(t *testing.T) {
	days := 7.0
	sku := baseStockSKU()
	sku.CurrentStock = 15
	sku.DaysOfCover = &days

	rr, ok := evaluateStockLowCoverage(baseStockInput([]SKUDailyMetric{sku}), sku)
	if !ok {
		t.Fatal("expected stock_low_coverage alert")
	}
	if rr.AlertType != AlertTypeStockLowCoverage {
		t.Fatalf("unexpected alert type: %s", rr.AlertType)
	}
}

func TestStockLowCoverageNoPanicWhenDaysMissing(t *testing.T) {
	sku := baseStockSKU()
	sku.CurrentStock = 10
	sku.DaysOfCover = nil

	if _, ok := evaluateStockLowCoverage(baseStockInput([]SKUDailyMetric{sku}), sku); ok {
		t.Fatal("must not alert with missing days_of_cover")
	}
}

func TestStockOOSRiskTriggersByCurrentStock(t *testing.T) {
	sku := baseStockSKU()
	sku.CurrentStock = 0

	rr, ok := evaluateStockOOSRisk(baseStockInput([]SKUDailyMetric{sku}), sku)
	if !ok {
		t.Fatal("expected stock_oos_risk by stock")
	}
	if rr.Urgency != UrgencyImmediate {
		t.Fatalf("expected immediate urgency, got %s", rr.Urgency)
	}
}

func TestStockOOSRiskTriggersByDaysOfCover(t *testing.T) {
	days := 2.0
	sku := baseStockSKU()
	sku.CurrentStock = 7
	sku.DaysOfCover = &days

	if _, ok := evaluateStockOOSRisk(baseStockInput([]SKUDailyMetric{sku}), sku); !ok {
		t.Fatal("expected stock_oos_risk by days_of_cover")
	}
}

func TestStockCriticalSKULowStockOnlyForKeySKU(t *testing.T) {
	days := 6.0
	sku := baseStockSKU()
	sku.CurrentStock = 5
	sku.DaysOfCover = &days
	sku.Revenue = 9000
	sku.OrdersCount = 4

	if _, ok := evaluateStockCriticalSKULowStock(baseStockInput([]SKUDailyMetric{sku}), sku); ok {
		t.Fatal("must not alert for non-key sku")
	}

	sku.Revenue = 12000
	if _, ok := evaluateStockCriticalSKULowStock(baseStockInput([]SKUDailyMetric{sku}), sku); !ok {
		t.Fatal("expected alert for key sku")
	}
}

func TestEvaluateStockRulesNoData(t *testing.T) {
	res := EvaluateStockRules(baseStockInput(nil))
	if len(res.RuleResults) != 0 {
		t.Fatalf("expected no alerts, got %d", len(res.RuleResults))
	}
}

func TestStockAlertFingerprintStable(t *testing.T) {
	days := 2.0
	sku := baseStockSKU()
	sku.CurrentStock = 3
	sku.DaysOfCover = &days

	rr, ok := evaluateStockOOSRisk(baseStockInput([]SKUDailyMetric{sku}), sku)
	if !ok {
		t.Fatal("expected oos alert")
	}

	inputA := RuleResultToUpsertInput(77, rr)
	inputB := RuleResultToUpsertInput(77, rr)
	if inputA.Fingerprint == "" {
		t.Fatal("fingerprint is empty")
	}
	if inputA.Fingerprint != inputB.Fingerprint {
		t.Fatal("fingerprint must be stable")
	}
}

func baseStockInput(metrics []SKUDailyMetric) StockRuleEvaluationInput {
	return StockRuleEvaluationInput{
		SellerAccountID: 1,
		AsOfDate:        "2026-04-30",
		SKUMetrics:      metrics,
	}
}

func baseStockSKU() SKUDailyMetric {
	sku := int64(123456)
	offer := "offer-123456"
	name := "Test SKU"
	return SKUDailyMetric{
		SellerAccountID: 1,
		OzonProductID:   111,
		SKU:             &sku,
		OfferID:         &offer,
		ProductName:     &name,
		Revenue:         0,
		OrdersCount:     0,
	}
}
