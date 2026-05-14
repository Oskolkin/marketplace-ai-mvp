package devseed

import (
	"context"
	"fmt"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
)

// cleanupMVPSellerData deletes rows for one seller so a reset can re-seed safely.
// Includes downstream tables (alerts, chat, recommendations) so stale test outputs are removed.
// Does not delete users, seller_accounts, or global reference data.
func cleanupMVPSellerData(ctx context.Context, exec dbgen.DBTX, sellerAccountID int64) error {
	if sellerAccountID <= 0 {
		return fmt.Errorf("cleanup: seller_account_id must be > 0")
	}

	steps := []string{
		"recommendation_run_diagnostics",
		"recommendation_feedback",
		"recommendation_alert_links",
		"recommendation_runs",
		"recommendations",
		"chat_feedback",
		"chat_traces",
		"chat_messages",
		"chat_sessions",
		"alert_runs",
		"alerts",
		"daily_sku_metrics",
		"daily_account_metrics",
		"ad_metrics_daily",
		"ad_campaign_skus",
		"ad_campaigns",
		"sku_effective_constraints",
		"pricing_constraint_rules",
		"sales",
		"orders",
		"stocks",
		"products",
		"import_jobs",
		"sync_jobs",
		"sync_cursors",
		"raw_payloads",
		"ozon_connections",
		"admin_action_logs",
		"seller_billing_state",
	}

	for _, table := range steps {
		q := fmt.Sprintf("DELETE FROM %s WHERE seller_account_id = $1", table)
		if _, err := exec.Exec(ctx, q, sellerAccountID); err != nil {
			return fmt.Errorf("cleanup %s: %w", table, err)
		}
	}
	return nil
}
