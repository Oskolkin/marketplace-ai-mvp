package devseed

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPricingDSN(t *testing.T) string {
	t.Helper()
	if v := os.Getenv("TEST_DATABASE_URL"); v != "" {
		return v
	}
	t.Skip("set TEST_DATABASE_URL to run pricing integration tests")
	return ""
}

func openPricingTestPool(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Skipf("db connect: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("db ping: %v", err)
	}
	return pool
}

func TestMVPPricingIntegration(t *testing.T) {
	dsn := testPricingDSN(t)
	pool := openPricingTestPool(t, dsn)
	ctx := context.Background()

	email := fmt.Sprintf("mvp_pricing_%d@test.local", time.Now().UnixNano())
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	q := dbgen.New(tx)

	u, err := q.CreateUser(ctx, dbgen.CreateUserParams{Email: email, PasswordHash: hash, Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	sa, err := q.CreateSellerAccount(ctx, dbgen.CreateSellerAccountParams{UserID: u.ID, Name: "Pricing IT", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	sellerID := sa.ID

	if err := cleanupMVPSellerData(ctx, tx, sellerID); err != nil {
		t.Fatal(err)
	}

	anchor := time.Date(2026, 6, 2, 0, 0, 0, 0, time.UTC)
	opts := MVPSeedOptions{
		AnchorDate:     anchor,
		Days:           90,
		ProductsTarget: 80,
		Seed:           20260514,
		Reset:          false,
	}
	if _, err := SeedMVPCommerce(ctx, q, sellerID, opts); err != nil {
		t.Fatal(err)
	}
	if _, err := SeedMVPPricing(ctx, q, sellerID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	var rules int64
	if err := pool.QueryRow(ctx, `
SELECT COUNT(*) FROM pricing_constraint_rules
WHERE seller_account_id = $1 AND is_active = TRUE`, sellerID).Scan(&rules); err != nil {
		t.Fatal(err)
	}
	if rules < 17 {
		t.Fatalf("active pricing rules %d want >= 17 (1 global + 6 category + 10 sku)", rules)
	}

	var eff int64
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM sku_effective_constraints WHERE seller_account_id = $1`, sellerID).Scan(&eff); err != nil {
		t.Fatal(err)
	}
	if eff < 10 {
		t.Fatalf("effective constraints %d want >= 10", eff)
	}

	var scopeKinds int64
	if err := pool.QueryRow(ctx, `
SELECT COUNT(DISTINCT resolved_from_scope_type) FROM sku_effective_constraints
WHERE seller_account_id = $1`, sellerID).Scan(&scopeKinds); err != nil {
		t.Fatal(err)
	}
	if scopeKinds < 3 {
		t.Fatalf("distinct resolved_from_scope_type %d want 3 (global, category, sku)", scopeKinds)
	}

	var badRange int64
	if err := pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints
WHERE seller_account_id = $1
  AND effective_min_price IS NOT NULL AND effective_max_price IS NOT NULL
  AND effective_min_price::float8 > effective_max_price::float8`, sellerID).Scan(&badRange); err != nil {
		t.Fatal(err)
	}
	if badRange != 0 {
		t.Fatalf("effective min > max rows: %d", badRange)
	}

	var badMargin int64
	if err := pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints
WHERE seller_account_id = $1
  AND reference_margin_percent IS NOT NULL
  AND (reference_margin_percent::float8 < 0 OR reference_margin_percent::float8 > 1)`, sellerID).Scan(&badMargin); err != nil {
		t.Fatal(err)
	}
	if badMargin != 0 {
		t.Fatalf("margin outside [0,1]: %d rows", badMargin)
	}

	var lowMarginPriceRisk int64
	if err := pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints e
JOIN products p ON p.seller_account_id = e.seller_account_id AND p.ozon_product_id = e.ozon_product_id
WHERE e.seller_account_id = $1
  AND p.raw_attributes->>'segment' = 'price_risk'
  AND p.reference_price::float8 > 0
  AND (p.reference_price::float8 - e.implied_cost::float8) / p.reference_price::float8 < 0.10`, sellerID).Scan(&lowMarginPriceRisk); err != nil {
		t.Fatal(err)
	}
	if lowMarginPriceRisk < 2 {
		t.Fatalf("price_risk SKUs with expected margin < 0.10 at product ref: %d want >= 2", lowMarginPriceRisk)
	}

	var overstockDiscount int64
	if err := pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints e
JOIN products p ON p.seller_account_id = e.seller_account_id AND p.ozon_product_id = e.ozon_product_id
WHERE e.seller_account_id = $1
  AND p.raw_attributes->>'segment' = 'overstock'
  AND e.effective_min_price::float8 <= e.reference_price::float8 * 0.58`, sellerID).Scan(&overstockDiscount); err != nil {
		t.Fatal(err)
	}
	if overstockDiscount < 2 {
		t.Fatalf("overstock SKUs with low effective min vs ref: %d want >= 2", overstockDiscount)
	}

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID)
	})
}
