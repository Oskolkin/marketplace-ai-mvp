package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/alerts"
	"go.uber.org/zap"
)

// postSyncMetricsLookbackDays is the inclusive window (UTC calendar days) for rebuilding
// daily_account_metrics and daily_sku_metrics after ingestion. Keeps work bounded vs full history.
const postSyncMetricsLookbackDays = 30

// postSyncAccountMetrics rebuilds account-level aggregates for a date range.
type postSyncAccountMetrics interface {
	RebuildDailyAccountMetricsForDateRange(ctx context.Context, sellerAccountID int64, dateFrom, dateTo time.Time) (int, error)
}

// postSyncSKUMetrics rebuilds SKU-level aggregates for a date range.
type postSyncSKUMetrics interface {
	RebuildDailySKUMetricsForDateRange(ctx context.Context, sellerAccountID int64, dateFrom, dateTo time.Time) (int, error)
}

// postSyncAlerts runs the alerts engine for an account (fingerprint / idempotency live inside alerts.Service).
type postSyncAlerts interface {
	RunForAccountWithType(ctx context.Context, sellerAccountID int64, asOfDate time.Time, runType alerts.RunType) (alerts.RunForAccountSummary, error)
}

// RecalculateAfterSyncHandler runs bounded downstream work after a sync_job completes:
// account metrics -> SKU metrics -> alerts.
//
// AI recommendation generation is intentionally NOT invoked here: it stays manual / admin / user-triggered
// to control OpenAI cost and quality gates (see docs/stage-13-ingestion-downstream-recalculation.md).
type RecalculateAfterSyncHandler struct {
	account postSyncAccountMetrics
	sku     postSyncSKUMetrics
	alerts  postSyncAlerts
	log     *zap.Logger
}

// NewRecalculateAfterSyncHandler wires downstream services used after ingestion completes.
func NewRecalculateAfterSyncHandler(
	account postSyncAccountMetrics,
	sku postSyncSKUMetrics,
	alertsSvc postSyncAlerts,
	log *zap.Logger,
) *RecalculateAfterSyncHandler {
	return &RecalculateAfterSyncHandler{
		account: account,
		sku:     sku,
		alerts:  alertsSvc,
		log:     log,
	}
}

func postSyncCalendarDayUTC(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}

// Handle rebuilds bounded metrics and runs alerts. Returns error on any failed stage so the task can retry.
func (h *RecalculateAfterSyncHandler) Handle(ctx context.Context, taskPayload []byte) error {
	var payload RecalculateAfterSyncPayload
	if err := json.Unmarshal(taskPayload, &payload); err != nil {
		return fmt.Errorf("unmarshal post-sync recalculation payload: %w", err)
	}
	if payload.SellerAccountID <= 0 || payload.SyncJobID <= 0 {
		return fmt.Errorf("invalid post-sync payload: seller_account_id=%d sync_job_id=%d", payload.SellerAccountID, payload.SyncJobID)
	}

	to := postSyncCalendarDayUTC(time.Now())
	from := to.AddDate(0, 0, -(postSyncMetricsLookbackDays-1))

	h.log.Info("post-sync recalculation started",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.String("date_from", from.Format("2006-01-02")),
		zap.String("date_to", to.Format("2006-01-02")),
	)

	nAcc, err := h.account.RebuildDailyAccountMetricsForDateRange(ctx, payload.SellerAccountID, from, to)
	if err != nil {
		h.log.Error("post-sync account metrics rebuild failed",
			zap.Int64("seller_account_id", payload.SellerAccountID),
			zap.Int64("sync_job_id", payload.SyncJobID),
			zap.Error(err),
		)
		return fmt.Errorf("rebuild account metrics: %w", err)
	}

	nSku, err := h.sku.RebuildDailySKUMetricsForDateRange(ctx, payload.SellerAccountID, from, to)
	if err != nil {
		h.log.Error("post-sync sku metrics rebuild failed",
			zap.Int64("seller_account_id", payload.SellerAccountID),
			zap.Int64("sync_job_id", payload.SyncJobID),
			zap.Error(err),
		)
		return fmt.Errorf("rebuild sku metrics: %w", err)
	}

	summary, err := h.alerts.RunForAccountWithType(ctx, payload.SellerAccountID, to, alerts.RunTypePostSync)
	if err != nil {
		h.log.Error("post-sync alerts run failed",
			zap.Int64("seller_account_id", payload.SellerAccountID),
			zap.Int64("sync_job_id", payload.SyncJobID),
			zap.Error(err),
		)
		return fmt.Errorf("run alerts post_sync: %w", err)
	}

	h.log.Info("post-sync recalculation completed",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int("account_daily_metrics_rows", nAcc),
		zap.Int("sku_daily_metrics_rows", nSku),
		zap.Int64("alert_run_id", summary.RunID),
		zap.String("alert_run_status", string(summary.Status)),
	)
	return nil
}
