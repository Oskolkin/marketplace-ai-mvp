package alerts

import (
	"testing"
	"time"
)

func TestSalesRevenueDropRuleTriggers(t *testing.T) {
	in := baseSalesInput()
	in.CurrentAccount.Revenue = 60
	in.PreviousAccount.Revenue = 100

	rr, ok := evaluateSalesRevenueDrop(in)
	if !ok {
		t.Fatal("expected revenue drop alert")
	}
	if rr.AlertType != AlertTypeSalesRevenueDrop {
		t.Fatalf("unexpected alert type: %s", rr.AlertType)
	}
}

func TestSalesOrdersDropRuleTriggers(t *testing.T) {
	in := baseSalesInput()
	in.CurrentAccount.OrdersCount = 50
	in.PreviousAccount.OrdersCount = 100

	rr, ok := evaluateSalesOrdersDrop(in)
	if !ok {
		t.Fatal("expected orders drop alert")
	}
	if rr.AlertType != AlertTypeSalesOrdersDrop {
		t.Fatalf("unexpected alert type: %s", rr.AlertType)
	}
}

func TestSKURevenueDropThresholdAndNoise(t *testing.T) {
	in := baseSalesInput()
	current := SKUDailyMetric{OzonProductID: 1, Revenue: 500}
	prevSmall := SKUDailyMetric{OzonProductID: 1, Revenue: 900}
	if _, ok := evaluateSKURevenueDrop(in, current, prevSmall); ok {
		t.Fatal("must not alert when previous revenue < 1000")
	}

	prevBig := SKUDailyMetric{OzonProductID: 1, Revenue: 1200}
	if _, ok := evaluateSKURevenueDrop(in, current, prevBig); !ok {
		t.Fatal("expected sku revenue drop alert for significant previous revenue")
	}
}

func TestSKUNegativeContributionRuleTriggers(t *testing.T) {
	in := baseSalesInput()
	current := SKUDailyMetric{OzonProductID: 1, Revenue: 700}
	previous := SKUDailyMetric{OzonProductID: 1, Revenue: 1000}
	accountDelta := -1000.0

	rr, ok := evaluateSKUNegativeContribution(in, current, previous, accountDelta)
	if !ok {
		t.Fatal("expected negative contribution alert")
	}
	if rr.AlertType != AlertTypeSKUNegativeContribution {
		t.Fatalf("unexpected alert type: %s", rr.AlertType)
	}
}

func TestPreviousZeroDoesNotCreateAlertOrPanic(t *testing.T) {
	in := baseSalesInput()
	in.CurrentAccount.Revenue = 10
	in.PreviousAccount.Revenue = 0
	if _, ok := evaluateSalesRevenueDrop(in); ok {
		t.Fatal("must not create revenue alert when previous=0")
	}

	in.CurrentAccount.OrdersCount = 10
	in.PreviousAccount.OrdersCount = 0
	if _, ok := evaluateSalesOrdersDrop(in); ok {
		t.Fatal("must not create orders alert when previous=0")
	}
}

func baseSalesInput() SalesRuleEvaluationInput {
	asOf := time.Date(2026, 4, 30, 0, 0, 0, 0, time.UTC)
	prev := asOf.AddDate(0, 0, -1)
	return SalesRuleEvaluationInput{
		SellerAccountID: 1,
		AsOfDate:        asOf,
		PreviousDate:    prev,
		CurrentAccount: &AccountDailyMetric{
			SellerAccountID: 1,
			MetricDate:      asOf,
			Revenue:         100,
			OrdersCount:     100,
		},
		PreviousAccount: &AccountDailyMetric{
			SellerAccountID: 1,
			MetricDate:      prev,
			Revenue:         100,
			OrdersCount:     100,
		},
	}
}
