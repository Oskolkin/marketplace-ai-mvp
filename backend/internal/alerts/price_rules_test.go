package alerts

import "testing"

func TestPriceBelowMinConstraintTriggers(t *testing.T) {
	ref := 90.0
	minp := 100.0
	p := basePriceContext()
	p.ReferencePrice = &ref
	p.EffectiveMinPrice = &minp
	p.HasEffectiveConstraint = true

	if _, ok := evaluatePriceBelowMinConstraint(basePriceInput([]ProductPricingContext{p}), p); !ok {
		t.Fatal("expected price_below_min_constraint")
	}
}

func TestPriceAboveMaxConstraintTriggers(t *testing.T) {
	ref := 120.0
	maxp := 100.0
	p := basePriceContext()
	p.ReferencePrice = &ref
	p.EffectiveMaxPrice = &maxp
	p.HasEffectiveConstraint = true

	if _, ok := evaluatePriceAboveMaxConstraint(basePriceInput([]ProductPricingContext{p}), p); !ok {
		t.Fatal("expected price_above_max_constraint")
	}
}

func TestMarginRiskAtCurrentPriceTriggers(t *testing.T) {
	ref := 100.0
	cost := 95.0
	p := basePriceContext()
	p.ReferencePrice = &ref
	p.ImpliedCost = &cost
	p.HasEffectiveConstraint = true

	if _, ok := evaluateMarginRiskAtCurrentPrice(basePriceInput([]ProductPricingContext{p}), p); !ok {
		t.Fatal("expected margin_risk_at_current_price")
	}
}

func TestMissingPricingConstraintsForKeySKUTiggers(t *testing.T) {
	p := basePriceContext()
	p.HasEffectiveConstraint = false
	p.RevenueForPeriod = 15000
	p.OrdersForPeriod = 2

	if _, ok := evaluateMissingPricingConstraintsForKeySKU(basePriceInput([]ProductPricingContext{p}), p); !ok {
		t.Fatal("expected missing_pricing_constraints_for_key_sku")
	}
}

func TestNoPriceAlertsWithoutEffectiveConstraint(t *testing.T) {
	ref := 100.0
	p := basePriceContext()
	p.ReferencePrice = &ref
	p.HasEffectiveConstraint = false

	if _, ok := evaluatePriceBelowMinConstraint(basePriceInput([]ProductPricingContext{p}), p); ok {
		t.Fatal("must not trigger below-min without min constraint")
	}
	if _, ok := evaluatePriceAboveMaxConstraint(basePriceInput([]ProductPricingContext{p}), p); ok {
		t.Fatal("must not trigger above-max without max constraint")
	}
	if _, ok := evaluateMarginRiskAtCurrentPrice(basePriceInput([]ProductPricingContext{p}), p); ok {
		t.Fatal("must not trigger margin risk without implied cost")
	}
}

func TestMissingReferencePriceDoesNotPanic(t *testing.T) {
	p := basePriceContext()
	p.ReferencePrice = nil
	p.HasEffectiveConstraint = true

	if _, ok := evaluatePriceBelowMinConstraint(basePriceInput([]ProductPricingContext{p}), p); ok {
		t.Fatal("must not trigger without reference price")
	}
	if _, ok := evaluateMarginRiskAtCurrentPrice(basePriceInput([]ProductPricingContext{p}), p); ok {
		t.Fatal("must not trigger margin risk without reference price")
	}
}

func basePriceInput(products []ProductPricingContext) PriceRuleEvaluationInput {
	return PriceRuleEvaluationInput{
		SellerAccountID: 1,
		AsOfDate:        "2026-04-30",
		Products:        products,
	}
}

func basePriceContext() ProductPricingContext {
	sku := int64(444)
	offer := "offer-444"
	return ProductPricingContext{
		SellerAccountID: 1,
		OzonProductID:   444,
		SKU:             &sku,
		OfferID:         &offer,
		ProductName:     "Price SKU",
	}
}
