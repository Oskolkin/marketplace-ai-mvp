package recommendations

import (
	"context"
	"fmt"
	"sort"
	"time"
)

const (
	defaultContextVersion = "stage8.context.v1"
	defaultTopAlerts      = 50
	defaultTopRecs        = 50
	defaultTopSKUs        = 30
	defaultTopCampaigns   = 20
	defaultTopConstraints = 30
)

func (b *ContextBuilder) BuildForAccount(ctx context.Context, sellerAccountID int64, asOfDate time.Time) (*AIRecommendationContext, error) {
	asOf := asOfDate.UTC().Truncate(24 * time.Hour)
	previous := asOf.AddDate(0, 0, -1)
	adsFrom := asOf.AddDate(0, 0, -6)

	currentMetric, err := b.repo.GetDailyAccountMetricByDate(ctx, sellerAccountID, asOf)
	if err != nil {
		return nil, fmt.Errorf("get current account metric: %w", err)
	}
	previousMetric, err := b.repo.GetDailyAccountMetricByDate(ctx, sellerAccountID, previous)
	if err != nil {
		return nil, fmt.Errorf("get previous account metric: %w", err)
	}
	skuMetrics, err := b.repo.ListDailySKUMetricsByDate(ctx, sellerAccountID, asOf)
	if err != nil {
		return nil, fmt.Errorf("list daily sku metrics: %w", err)
	}
	openAlerts, err := b.repo.ListOpenAlerts(ctx, sellerAccountID, defaultTopAlerts, 0)
	if err != nil {
		return nil, fmt.Errorf("list open alerts: %w", err)
	}
	alertsBySeverity, err := b.repo.CountOpenAlertsBySeverity(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("count open alerts by severity: %w", err)
	}
	alertsByGroup, err := b.repo.CountOpenAlertsByGroup(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("count open alerts by group: %w", err)
	}
	alertRun, err := b.repo.GetLatestAlertRun(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("get latest alert run: %w", err)
	}
	openRecs, err := b.repo.ListOpenRecommendations(ctx, sellerAccountID, defaultTopRecs, 0)
	if err != nil {
		return nil, fmt.Errorf("list open recommendations: %w", err)
	}
	openRecsTotal, err := b.repo.CountOpenRecommendations(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("count open recommendations: %w", err)
	}
	recsByPriority, err := b.repo.CountOpenRecommendationsByPriority(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("count open recommendations by priority: %w", err)
	}
	recsByConfidence, err := b.repo.CountOpenRecommendationsByConfidence(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("count open recommendations by confidence: %w", err)
	}
	recRun, err := b.repo.GetLatestRecommendationRun(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("get latest recommendation run: %w", err)
	}
	campaigns, err := b.repo.ListAdCampaignSummariesByDateRange(ctx, sellerAccountID, adsFrom, asOf)
	if err != nil {
		return nil, fmt.Errorf("list ad campaign summaries: %w", err)
	}
	constraints, err := b.repo.ListSKUEffectiveConstraintsBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		return nil, fmt.Errorf("list effective constraints: %w", err)
	}

	revenueDelta := percentageDelta(currentMetric, previousMetric, func(m *AccountDailyMetric) float64 { return m.Revenue })
	ordersDelta := percentageDelta(currentMetric, previousMetric, func(m *AccountDailyMetric) float64 { return float64(m.OrdersCount) })

	context := &AIRecommendationContext{
		ContextVersion: defaultContextVersion,
		SellerAccountID: sellerAccountID,
		AsOfDate:       formatDate(asOf),
		GeneratedAt:    time.Now().UTC(),
		Windows: ContextWindows{
			PreviousDate: formatDate(previous),
			AdsDateFrom:  formatDate(adsFrom),
			AdsDateTo:    formatDate(asOf),
		},
		Account: AccountContext{
			Current:         currentMetric,
			Previous:        previousMetric,
			RevenueDeltaPct: revenueDelta,
			OrdersDeltaPct:  ordersDelta,
		},
		Alerts: AlertsContext{
			OpenTotal:  sumCounts(alertsBySeverity),
			BySeverity: ensureCounts(alertsBySeverity),
			ByGroup:    ensureCounts(alertsByGroup),
			TopOpen:    openAlerts,
			LatestRun:  alertRun,
		},
		Recommendations: RecommendationsContext{
			OpenTotal:    openRecsTotal,
			ByPriority:   ensureCounts(recsByPriority),
			ByConfidence: ensureCounts(recsByConfidence),
			TopOpen:      openRecs,
			LatestRun:    recRun,
		},
		Merchandising: MerchandisingContext{
			TotalSKUs:      len(skuMetrics),
			TopRevenueSKUs: topRevenueSKUs(skuMetrics, defaultTopSKUs),
			LowStockSKUs:   lowStockSKUs(skuMetrics, defaultTopSKUs),
		},
		Advertising: AdvertisingContext{
			TopCampaigns: topCampaignsBySpend(campaigns, defaultTopCampaigns),
		},
		Pricing: PricingContext{
			EffectiveConstraintsCount: len(constraints),
			TopConstrainedSKUs:        topConstraints(constraints, defaultTopConstraints),
		},
	}

	ApplyRecommendationContextBudget(context, b.limits)

	return context, nil
}

func formatDate(t time.Time) string {
	return t.UTC().Format("2006-01-02")
}

func ensureCounts(in []NamedCount) []NamedCount {
	if in == nil {
		return []NamedCount{}
	}
	return in
}

func sumCounts(in []NamedCount) int64 {
	var total int64
	for _, c := range in {
		total += c.Count
	}
	return total
}

func percentageDelta(current *AccountDailyMetric, previous *AccountDailyMetric, value func(*AccountDailyMetric) float64) *float64 {
	if current == nil || previous == nil {
		return nil
	}
	base := value(previous)
	if base == 0 {
		return nil
	}
	delta := ((value(current) - base) / base) * 100
	return &delta
}

func topRevenueSKUs(items []SKUDailyMetric, limit int) []SKUDailyMetric {
	out := append([]SKUDailyMetric(nil), items...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Revenue == out[j].Revenue {
			return out[i].OzonProductID < out[j].OzonProductID
		}
		return out[i].Revenue > out[j].Revenue
	})
	return clamp(out, limit)
}

func lowStockSKUs(items []SKUDailyMetric, limit int) []SKUDailyMetric {
	out := make([]SKUDailyMetric, 0, len(items))
	for _, item := range items {
		if item.StockAvailable <= 0 || (item.DaysOfCover != nil && *item.DaysOfCover <= 7) {
			out = append(out, item)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].StockAvailable == out[j].StockAvailable {
			return out[i].OzonProductID < out[j].OzonProductID
		}
		return out[i].StockAvailable < out[j].StockAvailable
	})
	return clamp(out, limit)
}

func topCampaignsBySpend(items []AdCampaignSummary, limit int) []AdCampaignSummary {
	out := append([]AdCampaignSummary(nil), items...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].SpendTotal == out[j].SpendTotal {
			return out[i].CampaignExternalID < out[j].CampaignExternalID
		}
		return out[i].SpendTotal > out[j].SpendTotal
	})
	return clamp(out, limit)
}

func topConstraints(items []EffectiveConstraint, limit int) []EffectiveConstraint {
	out := append([]EffectiveConstraint(nil), items...)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].OzonProductID < out[j].OzonProductID
	})
	return clamp(out, limit)
}

func clamp[T any](in []T, limit int) []T {
	if in == nil {
		return []T{}
	}
	if limit <= 0 || len(in) <= limit {
		return in
	}
	return in[:limit]
}
