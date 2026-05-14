package devseed

import (
	"context"
	"fmt"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/analytics"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RebuildMVPAnalytics runs existing analytics services over freshly inserted commerce data.
func RebuildMVPAnalytics(ctx context.Context, pool *pgxpool.Pool, sellerAccountID int64) error {
	ac := analytics.NewAccountMetricsService(pool)
	if err := ac.RebuildDailyAccountMetricsForSellerAccount(ctx, sellerAccountID); err != nil {
		return fmt.Errorf("rebuild account metrics: %w", err)
	}
	sku := analytics.NewSKUMetricsService(pool)
	if err := sku.RebuildDailySKUMetricsForSellerAccount(ctx, sellerAccountID); err != nil {
		return fmt.Errorf("rebuild sku metrics: %w", err)
	}
	return nil
}
