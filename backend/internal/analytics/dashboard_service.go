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
	LastUpdatedAt   *string                   `json:"last_updated_at"`
	Account         DashboardAccountMetrics   `json:"account"`
	SKUs            []DashboardSKUMetricsItem `json:"skus"`
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

func (s *DashboardService) BuildDashboardMetrics(ctx context.Context, sellerAccountID int64, asOfDate time.Time) (DashboardMetricsDTO, error) {
	asOf := normalizeDate(asOfDate)
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
		LastUpdatedAt:   timestamptzToRFC3339(maxUpdatedAt),
		Account: DashboardAccountMetrics{
			RevenueToday:      revenueToday,
			RevenueYesterday:  revenueYesterday,
			RevenueLast7Days:  last7Revenue,
			RevenueDayDelta:   buildDelta(revenueToday, revenueYesterday),
			RevenueWeekDelta:  buildDelta(last7Revenue, previous7Revenue),
			OrdersToday:       todayAccount.OrdersCount,
			OrdersYesterday:   yesterdayAccount.OrdersCount,
			ReturnsToday:      todayAccount.ReturnsCount,
			CancelsToday:      todayAccount.CancelCount,
			PreviousWeekTotal: previous7Revenue,
		},
		SKUs: skuItems,
	}, nil
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
