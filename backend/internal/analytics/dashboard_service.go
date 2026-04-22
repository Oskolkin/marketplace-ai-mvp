package analytics

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardService struct {
	queries *dbgen.Queries
}

func NewDashboardService(db *pgxpool.Pool) *DashboardService {
	return &DashboardService{
		queries: dbgen.New(db),
	}
}

type DashboardMetricsDTO struct {
	SellerAccountID int64                     `json:"seller_account_id"`
	AsOfDate        string                    `json:"as_of_date"`
	AsOfDateSource  string                    `json:"as_of_date_source"`
	LastUpdatedAt   *string                   `json:"last_updated_at"`
	Summary         DashboardSummaryMeta      `json:"summary"`
	Account         DashboardAccountMetrics   `json:"account"`
	SKUs            []DashboardSKUMetricsItem `json:"skus"`
}

type DashboardSummaryMeta struct {
	PeriodUsed              string `json:"period_used"`
	DataFreshness           string `json:"data_freshness"`
	KPISemantics            string `json:"kpi_semantics"`
	SKUOrdersSemantics      string `json:"sku_orders_semantics"`
	StocksSemantics         string `json:"stocks_semantics"`
	ContributionSemantics   string `json:"contribution_semantics"`
	ShareOfRevenueSemantics string `json:"share_of_revenue_semantics"`
}

type DashboardAccountMetrics struct {
	RevenueToday      float64        `json:"revenue_today"`
	RevenueYesterday  float64        `json:"revenue_yesterday"`
	RevenueLast7Days  float64        `json:"revenue_last_7d"`
	RevenueDayDelta   DashboardDelta `json:"revenue_day_to_day_delta"`
	RevenueWeekDelta  DashboardDelta `json:"revenue_week_to_week_delta"`
	OrdersToday       int32          `json:"orders_today"`
	OrdersYesterday   int32          `json:"orders_yesterday"`
	ReturnsToday      int32          `json:"returns_today"`
	CancelsToday      int32          `json:"cancels_today"`
	PreviousWeekTotal float64        `json:"previous_week_revenue"`
}

type DashboardDelta struct {
	Abs float64  `json:"abs"`
	Pct *float64 `json:"pct"`
}

type DashboardSKUMetricsItem struct {
	OzonProductID               int64    `json:"ozon_product_id"`
	OfferID                     *string  `json:"offer_id"`
	SKU                         *int64   `json:"sku"`
	ProductName                 *string  `json:"product_name"`
	Revenue                     float64  `json:"revenue"`
	OrdersCount                 int32    `json:"orders_count"`
	StockAvailable              int32    `json:"stock_available"`
	DaysOfCover                 *float64 `json:"days_of_cover"`
	RevenueDeltaDayToDay        float64  `json:"revenue_delta_day_to_day"`
	OrdersDeltaDayToDay         int32    `json:"orders_delta_day_to_day"`
	ShareOfRevenue              *float64 `json:"share_of_revenue"`
	ContributionToRevenueChange float64  `json:"contribution_to_revenue_change"`
}

func (s *DashboardService) BuildDashboardMetrics(ctx context.Context, sellerAccountID int64, asOfDate *time.Time) (DashboardMetricsDTO, error) {
	asOf, asOfSource, err := s.resolveAsOfDate(ctx, sellerAccountID, asOfDate)
	if err != nil {
		return DashboardMetricsDTO{}, err
	}
	from := asOf.AddDate(0, 0, -13)
	yesterday := asOf.AddDate(0, 0, -1)

	accountRows, err := s.queries.ListDailyAccountMetricsBySellerAndDateRange(ctx, dbgen.ListDailyAccountMetricsBySellerAndDateRangeParams{
		SellerAccountID: sellerAccountID,
		MetricDate:      dateValue(from),
		MetricDate_2:    dateValue(asOf),
	})
	if err != nil {
		return DashboardMetricsDTO{}, fmt.Errorf("list account metrics by date range: %w", err)
	}

	accountByDate := make(map[string]dbgen.DailyAccountMetric, len(accountRows))
	for _, row := range accountRows {
		accountByDate[row.MetricDate.Time.Format("2006-01-02")] = row
	}

	todayKey := asOf.Format("2006-01-02")
	yesterdayKey := yesterday.Format("2006-01-02")
	todayAccount := accountByDate[todayKey]
	yesterdayAccount := accountByDate[yesterdayKey]

	revenueToday := numericToFloat(todayAccount.Revenue)
	revenueYesterday := numericToFloat(yesterdayAccount.Revenue)
	last7Revenue := sumRevenueForRange(accountRows, asOf.AddDate(0, 0, -6), asOf)
	previous7Revenue := sumRevenueForRange(accountRows, asOf.AddDate(0, 0, -13), asOf.AddDate(0, 0, -7))

	skuRows, err := s.queries.ListDailySKUMetricsBySellerAndDateRange(ctx, dbgen.ListDailySKUMetricsBySellerAndDateRangeParams{
		SellerAccountID: sellerAccountID,
		MetricDate:      dateValue(yesterday),
		MetricDate_2:    dateValue(asOf),
	})
	if err != nil {
		return DashboardMetricsDTO{}, fmt.Errorf("list sku metrics by date range: %w", err)
	}

	skusToday := make([]dbgen.DailySkuMetric, 0)
	skusYesterdayByProduct := make(map[int64]dbgen.DailySkuMetric)
	for _, row := range skuRows {
		key := row.MetricDate.Time.Format("2006-01-02")
		if key == todayKey {
			skusToday = append(skusToday, row)
			continue
		}
		if key == yesterdayKey {
			skusYesterdayByProduct[row.OzonProductID] = row
		}
	}

	skuItems := make([]DashboardSKUMetricsItem, 0, len(skusToday))
	var maxUpdatedAt pgtype.Timestamptz
	for _, todayRow := range skusToday {
		yesterdayRow := skusYesterdayByProduct[todayRow.OzonProductID]
		todayRevenue := numericToFloat(todayRow.Revenue)
		yesterdayRevenue := numericToFloat(yesterdayRow.Revenue)
		revenueDelta := round2(todayRevenue - yesterdayRevenue)
		share := safeRatio(todayRevenue, revenueToday)

		skuItems = append(skuItems, DashboardSKUMetricsItem{
			OzonProductID:               todayRow.OzonProductID,
			OfferID:                     textPtr(todayRow.OfferID),
			SKU:                         int8Ptr(todayRow.Sku),
			ProductName:                 textPtr(todayRow.ProductName),
			Revenue:                     todayRevenue,
			OrdersCount:                 todayRow.OrdersCount,
			StockAvailable:              todayRow.StockAvailable,
			DaysOfCover:                 numericToFloatPtr(todayRow.DaysOfCover),
			RevenueDeltaDayToDay:        revenueDelta,
			OrdersDeltaDayToDay:         todayRow.OrdersCount - yesterdayRow.OrdersCount,
			ShareOfRevenue:              share,
			ContributionToRevenueChange: revenueDelta,
		})

		maxUpdatedAt = maxTimestamptz(maxUpdatedAt, todayRow.UpdatedAt)
	}

	ordersToday, ordersYesterday := sumSKUOrdersForDay(skusToday, skusYesterdayByProduct)

	for _, row := range accountRows {
		maxUpdatedAt = maxTimestamptz(maxUpdatedAt, row.UpdatedAt)
	}

	sort.Slice(skuItems, func(i, j int) bool {
		if skuItems[i].Revenue == skuItems[j].Revenue {
			return skuItems[i].OzonProductID < skuItems[j].OzonProductID
		}
		return skuItems[i].Revenue > skuItems[j].Revenue
	})

	return DashboardMetricsDTO{
		SellerAccountID: sellerAccountID,
		AsOfDate:        todayKey,
		AsOfDateSource:  asOfSource,
		LastUpdatedAt:   timestamptzToRFC3339(maxUpdatedAt),
		Summary: DashboardSummaryMeta{
			PeriodUsed:              buildPeriodUsed(todayKey),
			DataFreshness:           resolveDataFreshness(todayKey),
			KPISemantics:            "Revenue and orders are aligned to sales-based metric_date for dashboard consistency; returns/cancels are order-status counts for the same metric_date.",
			SKUOrdersSemantics:      "SKU orders_count is sales-operation count on SKU/day grain.",
			StocksSemantics:         "Stocks endpoint and stock fields represent current-state snapshot from latest warehouse rows, not historical stock flow.",
			ContributionSemantics:   "contribution_to_revenue_change = sku_revenue(day) - sku_revenue(day-1).",
			ShareOfRevenueSemantics: "share_of_revenue = sku_revenue(day) / account_revenue(day).",
		},
		Account: DashboardAccountMetrics{
			RevenueToday:      revenueToday,
			RevenueYesterday:  revenueYesterday,
			RevenueLast7Days:  last7Revenue,
			RevenueDayDelta:   buildDelta(revenueToday, revenueYesterday),
			RevenueWeekDelta:  buildDelta(last7Revenue, previous7Revenue),
			OrdersToday:       ordersToday,
			OrdersYesterday:   ordersYesterday,
			ReturnsToday:      todayAccount.ReturnsCount,
			CancelsToday:      todayAccount.CancelCount,
			PreviousWeekTotal: previous7Revenue,
		},
		SKUs: skuItems,
	}, nil
}

func (s *DashboardService) resolveAsOfDate(ctx context.Context, sellerAccountID int64, asOfDate *time.Time) (time.Time, string, error) {
	if asOfDate != nil {
		return normalizeDate(*asOfDate), "request", nil
	}

	latestDate, err := s.queries.GetLatestAvailableDashboardMetricDateBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("get latest available dashboard metric date: %w", err)
	}
	if latestDate.Valid && latestDate.Time.Year() > 1970 {
		return normalizeDate(latestDate.Time), "latest_available", nil
	}

	return normalizeDate(time.Now().UTC()), "fallback_today", nil
}

func sumSKUOrdersForDay(todayRows []dbgen.DailySkuMetric, yesterdayByProduct map[int64]dbgen.DailySkuMetric) (int32, int32) {
	var ordersToday int32
	var ordersYesterday int32
	for _, row := range todayRows {
		ordersToday += row.OrdersCount
		ordersYesterday += yesterdayByProduct[row.OzonProductID].OrdersCount
	}
	return ordersToday, ordersYesterday
}

func buildPeriodUsed(asOfDate string) string {
	return asOfDate + " (d) / last 7 days for WoW"
}

func resolveDataFreshness(asOfDate string) string {
	asOf, err := time.Parse("2006-01-02", asOfDate)
	if err != nil {
		return "unknown"
	}

	daysLag := int(time.Since(asOf.UTC()).Hours() / 24)
	switch {
	case daysLag <= 0:
		return "fresh"
	case daysLag <= 1:
		return "stale_1d"
	default:
		return "stale"
	}
}

func maxTimestamptz(current pgtype.Timestamptz, next pgtype.Timestamptz) pgtype.Timestamptz {
	if !next.Valid {
		return current
	}
	if !current.Valid || next.Time.After(current.Time) {
		return next
	}
	return current
}

func buildDelta(current float64, previous float64) DashboardDelta {
	abs := round2(current - previous)
	return DashboardDelta{
		Abs: abs,
		Pct: safeRatio(abs, previous),
	}
}

func sumRevenueForRange(rows []dbgen.DailyAccountMetric, from time.Time, to time.Time) float64 {
	fromDate := normalizeDate(from)
	toDate := normalizeDate(to)
	var sum float64
	for _, row := range rows {
		metricDate := normalizeDate(row.MetricDate.Time)
		if metricDate.Before(fromDate) || metricDate.After(toDate) {
			continue
		}
		sum += numericToFloat(row.Revenue)
	}
	return round2(sum)
}

func safeRatio(numerator float64, denominator float64) *float64 {
	if denominator == 0 {
		return nil
	}
	value := round2(numerator / denominator)
	return &value
}

func numericToFloat(n pgtype.Numeric) float64 {
	if value := numericToFloatPtr(n); value != nil {
		return *value
	}
	return 0
}

func numericToFloatPtr(n pgtype.Numeric) *float64 {
	if !n.Valid {
		return nil
	}
	v, err := n.Float64Value()
	if err != nil || !v.Valid {
		return nil
	}
	value := round2(v.Float64)
	return &value
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
