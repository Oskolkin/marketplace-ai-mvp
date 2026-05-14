package devseed

import (
	"context"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MVPValidateRow is one row of the validate-only report.
type MVPValidateRow struct {
	Component string
	Expected  string
	Actual    string
	OK        bool
}

// PrintMVPValidationTable prints Component | Expected | Actual | Status.
func PrintMVPValidationTable(rows []MVPValidateRow) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	_, _ = fmt.Fprintln(w, "Component\tExpected\tActual\tStatus")
	for _, r := range rows {
		st := "OK"
		if !r.OK {
			st = "FAIL"
		}
		act := r.Actual
		if act == "" {
			act = "—"
		}
		_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", r.Component, r.Expected, act, st)
	}
	_ = w.Flush()
}

// PrintMVPValidationHints prints optional next steps (alerts / recommendations / chat).
func PrintMVPValidationHints() {
	fmt.Println("Hints (optional product flows, not required for seed validation):")
	fmt.Println(`  • Run alerts from /app/alerts to create alerts from seeded data`)
	fmt.Println(`  • Or: go run ./cmd/dev-seed-mvp --seller-account-id <id> --validate-alert-generation [--reset-derived]`)
	fmt.Println(`  • Or: go run ./cmd/dev-seed-mvp --seller-account-id <id> --validate-recommendation-generation (needs OPENAI_API_KEY + open alerts)`)
	fmt.Println(`  • Or: go run ./cmd/dev-seed-mvp --seller-account-id <id> --validate-derived (read-only: checks alerts/recs/chat/admin after manual UI tests)`)
	fmt.Println(`  • Generate recommendations from /app/recommendations after alerts`)
	fmt.Println(`  • Ask questions in /app/chat to create chat sessions and traces`)
}

// ValidateMVPSeededSeller checks that MVP-shaped source data exists for the seller.
// Anchor for "last 7 days" is MAX(daily_account_metrics.metric_date), else MAX(sales.sale_date), else UTC today.
func ValidateMVPSeededSeller(ctx context.Context, pool *pgxpool.Pool, sellerAccountID int64) ([]MVPValidateRow, bool) {
	q := dbgen.New(pool)
	var rows []MVPValidateRow
	allOK := true

	add := func(component, expected, actual string, ok bool) {
		if !ok {
			allOK = false
		}
		rows = append(rows, MVPValidateRow{
			Component: component,
			Expected:  expected,
			Actual:    actual,
			OK:        ok,
		})
	}

	if _, err := q.GetSellerAccountByID(ctx, sellerAccountID); err != nil {
		if err == pgx.ErrNoRows {
			add("user/seller: seller account", "exists", "not found", false)
		} else {
			add("user/seller: seller account", "exists", fmt.Sprintf("query error: %v", err), false)
		}
		return rows, false
	}
	add("user/seller: seller account", "exists", fmt.Sprintf("id=%d", sellerAccountID), true)

	oc, err := q.GetOzonConnectionBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		if err == pgx.ErrNoRows {
			add("integration: ozon_connection", "exists", "not found", false)
		} else {
			add("integration: ozon_connection", "exists", fmt.Sprintf("error: %v", err), false)
		}
		return rows, false
	}
	add("integration: ozon_connection", "exists", fmt.Sprintf("id=%d", oc.ID), true)

	sellerAPIOK := strings.EqualFold(strings.TrimSpace(oc.Status), "valid")
	add("integration: seller API status", "valid", strings.TrimSpace(oc.Status), sellerAPIOK)

	pTok := strings.TrimSpace(oc.PerformanceTokenEncrypted.String)
	pTokSet := oc.PerformanceTokenEncrypted.Valid && pTok != ""
	add("integration: performance token", "set (encrypted)", fmt.Sprintf("len=%d", len(pTok)), pTokSet)

	pStatOK := strings.EqualFold(strings.TrimSpace(oc.PerformanceStatus), "valid")
	add("integration: performance status", "valid", strings.TrimSpace(oc.PerformanceStatus), pStatOK)

	anchor, err := resolveMVPValidationAnchorDate(ctx, pool, sellerAccountID)
	if err != nil {
		add("metrics: anchor date", "resolved", fmt.Sprintf("error: %v", err), false)
		return rows, false
	}
	add("metrics: anchor date (max data)", "date", anchor.Format("2006-01-02"), true)

	var pc, ocCount, sc, stc int64
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM products WHERE seller_account_id = $1`, sellerAccountID).Scan(&pc)
	add("source: products count", ">= 50", fmt.Sprintf("%d", pc), pc >= 50)

	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE seller_account_id = $1`, sellerAccountID).Scan(&ocCount)
	add("source: orders count", "> 0", fmt.Sprintf("%d", ocCount), ocCount > 0)

	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM sales WHERE seller_account_id = $1`, sellerAccountID).Scan(&sc)
	add("source: sales count", "> 0", fmt.Sprintf("%d", sc), sc > 0)

	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM stocks WHERE seller_account_id = $1`, sellerAccountID).Scan(&stc)
	add("source: stocks rows", "> 0", fmt.Sprintf("%d", stc), stc > 0)

	var ord7, sal7 int64
	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM orders
WHERE seller_account_id = $1
  AND created_at_source::date > $2::date - interval '7 days'
  AND created_at_source::date <= $2::date`, sellerAccountID, anchor).Scan(&ord7)
	add("source: orders (last 7d to anchor)", "> 0", fmt.Sprintf("%d", ord7), ord7 > 0)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sales
WHERE seller_account_id = $1
  AND sale_date::date > $2::date - interval '7 days'
  AND sale_date::date <= $2::date`, sellerAccountID, anchor).Scan(&sal7)
	add("source: sales (last 7d to anchor)", "> 0", fmt.Sprintf("%d", sal7), sal7 > 0)

	var dam7, dsm7 int64
	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM daily_account_metrics
WHERE seller_account_id = $1
  AND metric_date > $2::date - interval '7 days'
  AND metric_date <= $2::date`, sellerAccountID, anchor).Scan(&dam7)
	add("metrics: daily_account_metrics (last 7d)", "> 0 rows", fmt.Sprintf("%d", dam7), dam7 > 0)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM daily_sku_metrics
WHERE seller_account_id = $1
  AND metric_date > $2::date - interval '7 days'
  AND metric_date <= $2::date`, sellerAccountID, anchor).Scan(&dsm7)
	add("metrics: daily_sku_metrics (last 7d)", "> 0 rows", fmt.Sprintf("%d", dsm7), dsm7 > 0)

	var cc, admr, acs int64
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM ad_campaigns WHERE seller_account_id = $1`, sellerAccountID).Scan(&cc)
	add("advertising: ad_campaigns", ">= 5", fmt.Sprintf("%d", cc), cc >= 5)

	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM ad_metrics_daily WHERE seller_account_id = $1`, sellerAccountID).Scan(&admr)
	add("advertising: ad_metrics_daily", "> 0", fmt.Sprintf("%d", admr), admr > 0)

	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM ad_campaign_skus WHERE seller_account_id = $1`, sellerAccountID).Scan(&acs)
	add("advertising: ad_campaign_skus", "> 0", fmt.Sprintf("%d", acs), acs > 0)

	var weakROAS int64
	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM (
  SELECT m.campaign_external_id,
    SUM(m.revenue::float8) / NULLIF(SUM(m.spend::float8), 0) AS roas
  FROM ad_metrics_daily m
  WHERE m.seller_account_id = $1
  GROUP BY m.campaign_external_id
) t WHERE t.roas < 1`, sellerAccountID).Scan(&weakROAS)
	add("advertising: weak ROAS scenario", ">=1 campaign", fmt.Sprintf("campaigns=%d", weakROAS), weakROAS >= 1)

	var spendNoResult int64
	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM (
  SELECT campaign_external_id
  FROM ad_metrics_daily
  WHERE seller_account_id = $1
  GROUP BY campaign_external_id
  HAVING SUM(orders_count) = 0
     AND COALESCE(SUM(revenue::numeric), 0) = 0
     AND SUM(spend::numeric) > 0
     AND SUM(clicks) > 0
) x`, sellerAccountID).Scan(&spendNoResult)
	add("advertising: spend w/o result", ">=1 campaign", fmt.Sprintf("campaigns=%d", spendNoResult), spendNoResult >= 1)

	var lowStockAdv int64
	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM ad_campaign_skus acs
JOIN products p ON p.seller_account_id = acs.seller_account_id AND p.ozon_product_id = acs.ozon_product_id
JOIN (
  SELECT product_external_id, SUM(quantity_available)::bigint AS s
  FROM stocks WHERE seller_account_id = $1
  GROUP BY product_external_id
) st ON st.product_external_id = acs.ozon_product_id::text
WHERE acs.seller_account_id = $1 AND acs.is_active = TRUE AND st.s <= 8`, sellerAccountID).Scan(&lowStockAdv)
	add("advertising: low-stock active SKU link", ">=1", fmt.Sprintf("%d", lowStockAdv), lowStockAdv >= 1)

	const marginRiskAlertThreshold = 0.10 // internal/alerts marginRiskThreshold

	var gdc, catc, skuo, effc int64
	var effGlobal, effCat, effSKU, effScopeKinds int64
	var catDistinct int64
	var priceRiskScen, overstockDiscountScen int64

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM pricing_constraint_rules
WHERE seller_account_id = $1 AND scope_type = 'global_default' AND is_active = TRUE`, sellerAccountID).Scan(&gdc)
	add("pricing: rules global_default (active)", "1", fmt.Sprintf("%d", gdc), gdc == 1)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM pricing_constraint_rules
WHERE seller_account_id = $1 AND scope_type = 'category_rule' AND is_active = TRUE`, sellerAccountID).Scan(&catc)
	add("pricing: rules category_rule (active)", "6", fmt.Sprintf("%d", catc), catc == 6)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(DISTINCT scope_target_id) FROM pricing_constraint_rules
WHERE seller_account_id = $1 AND scope_type = 'category_rule' AND is_active = TRUE
  AND scope_target_id IS NOT NULL`, sellerAccountID).Scan(&catDistinct)
	add("pricing: rules category_rule (distinct targets)", "6", fmt.Sprintf("%d", catDistinct), catDistinct == 6)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM pricing_constraint_rules
WHERE seller_account_id = $1 AND scope_type = 'sku_override' AND is_active = TRUE`, sellerAccountID).Scan(&skuo)
	skuOverrideOK := skuo >= 8 && skuo <= 12
	add("pricing: rules sku_override (active)", "8-12", fmt.Sprintf("%d", skuo), skuOverrideOK)

	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM sku_effective_constraints WHERE seller_account_id = $1`, sellerAccountID).Scan(&effc)
	add("pricing: sku_effective_constraints (rows)", "> 0", fmt.Sprintf("%d", effc), effc > 0)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints
WHERE seller_account_id = $1 AND resolved_from_scope_type = 'global_default'`, sellerAccountID).Scan(&effGlobal)
	add("pricing: effective global_default (rows)", ">= 1", fmt.Sprintf("%d", effGlobal), effGlobal >= 1)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints
WHERE seller_account_id = $1 AND resolved_from_scope_type = 'category_rule'`, sellerAccountID).Scan(&effCat)
	add("pricing: effective category_rule (rows)", ">= 1", fmt.Sprintf("%d", effCat), effCat >= 1)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints
WHERE seller_account_id = $1 AND resolved_from_scope_type = 'sku_override'`, sellerAccountID).Scan(&effSKU)
	add("pricing: effective sku_override (rows)", ">= 1", fmt.Sprintf("%d", effSKU), effSKU >= 1)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(DISTINCT resolved_from_scope_type) FROM sku_effective_constraints
WHERE seller_account_id = $1`, sellerAccountID).Scan(&effScopeKinds)
	add("pricing: effective resolved_from_scope kinds", "3", fmt.Sprintf("%d", effScopeKinds), effScopeKinds == 3)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints e
JOIN products p ON p.seller_account_id = e.seller_account_id AND p.ozon_product_id = e.ozon_product_id
WHERE e.seller_account_id = $1
  AND p.raw_attributes->>'segment' = 'price_risk'
  AND p.reference_price IS NOT NULL AND p.reference_price::numeric > 0
  AND e.implied_cost IS NOT NULL
  AND (p.reference_price::numeric - e.implied_cost::numeric) / p.reference_price::numeric < $2::numeric`, sellerAccountID, marginRiskAlertThreshold).Scan(&priceRiskScen)
	add("pricing: price_risk scenario (expected margin < alert)", ">= 2",
		fmt.Sprintf("%d (threshold=%.2f)", priceRiskScen, marginRiskAlertThreshold), priceRiskScen >= 2)

	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM sku_effective_constraints e
JOIN products p ON p.seller_account_id = e.seller_account_id AND p.ozon_product_id = e.ozon_product_id
WHERE e.seller_account_id = $1
  AND p.raw_attributes->>'segment' = 'overstock'
  AND p.reference_price IS NOT NULL AND p.reference_price::numeric > 0
  AND e.effective_min_price IS NOT NULL
  AND (p.reference_price::numeric - e.effective_min_price::numeric) / p.reference_price::numeric >= 0.05`, sellerAccountID).Scan(&overstockDiscountScen)
	add("pricing: overstock scenario (discount headroom >= 5% to min)", ">= 2",
		fmt.Sprintf("%d", overstockDiscountScen), overstockDiscountScen >= 2)

	var sjc int64
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM sync_jobs WHERE seller_account_id = $1`, sellerAccountID).Scan(&sjc)
	add("sync: sync_jobs", "> 0", fmt.Sprintf("%d", sjc), sjc > 0)

	dr, err := pool.Query(ctx, `
SELECT DISTINCT domain FROM import_jobs WHERE seller_account_id = $1 ORDER BY domain`, sellerAccountID)
	var doms []string
	if err != nil {
		add("sync: import_job domains", "products,orders,sales,stocks,ads|advertising", fmt.Sprintf("error: %v", err), false)
	} else {
		defer dr.Close()
		for dr.Next() {
			var d string
			if scanErr := dr.Scan(&d); scanErr == nil {
				doms = append(doms, d)
			}
		}
	}
	need := map[string]bool{"products": false, "orders": false, "sales": false, "stocks": false, "ads": false}
	for _, d := range doms {
		switch d {
		case "products":
			need["products"] = true
		case "orders":
			need["orders"] = true
		case "sales":
			need["sales"] = true
		case "stocks":
			need["stocks"] = true
		case "ads", "advertising":
			need["ads"] = true
		}
	}
	missing := make([]string, 0)
	for _, k := range []string{"products", "orders", "sales", "stocks", "ads"} {
		if !need[k] {
			missing = append(missing, k)
		}
	}
	domOK := len(missing) == 0
	actDom := strings.Join(doms, ",")
	if !domOK {
		actDom = fmt.Sprintf("%s (missing: %s)", actDom, strings.Join(missing, ","))
	}
	add("sync: import_job domains", "products,orders,sales,stocks,ads|advertising", actDom, domOK)

	var failedImp int64
	_ = pool.QueryRow(ctx, `
SELECT COUNT(*) FROM import_jobs WHERE seller_account_id = $1 AND status = 'failed'`, sellerAccountID).Scan(&failedImp)
	add("sync: failed import_jobs", ">= 1", fmt.Sprintf("%d", failedImp), failedImp >= 1)

	var curN int64
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM sync_cursors WHERE seller_account_id = $1`, sellerAccountID).Scan(&curN)
	add("sync: sync_cursors", ">= 5", fmt.Sprintf("%d", curN), curN >= 5)

	if _, err := q.GetSellerBillingState(ctx, sellerAccountID); err != nil {
		if err == pgx.ErrNoRows {
			add("admin: seller_billing_state", "exists", "not found", false)
		} else {
			add("admin: seller_billing_state", "exists", fmt.Sprintf("error: %v", err), false)
		}
	} else {
		add("admin: seller_billing_state", "exists", "row present", true)
	}

	return rows, allOK
}

func resolveMVPValidationAnchorDate(ctx context.Context, pool *pgxpool.Pool, sellerAccountID int64) (time.Time, error) {
	var d pgtype.Date
	if err := pool.QueryRow(ctx, `
SELECT MAX(metric_date) FROM daily_account_metrics WHERE seller_account_id = $1`, sellerAccountID).Scan(&d); err != nil {
		return time.Time{}, err
	}
	if d.Valid {
		return d.Time.UTC(), nil
	}
	if err := pool.QueryRow(ctx, `
SELECT MAX(sale_date::date) FROM sales WHERE seller_account_id = $1`, sellerAccountID).Scan(&d); err != nil {
		return time.Time{}, err
	}
	if d.Valid {
		return d.Time.UTC(), nil
	}
	t := time.Now().UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), nil
}
