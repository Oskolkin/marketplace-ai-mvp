package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type OzonImportHandler struct {
	queries *dbgen.Queries
	log     *zap.Logger
	domain  string
}

func NewOzonImportHandler(db *pgxpool.Pool, log *zap.Logger, domain string) *OzonImportHandler {
	return &OzonImportHandler{
		queries: dbgen.New(db),
		log:     log,
		domain:  domain,
	}
}

func (h *OzonImportHandler) Handle(ctx context.Context, taskPayload []byte) error {
	var payload OzonImportJobPayload
	if err := json.Unmarshal(taskPayload, &payload); err != nil {
		return fmt.Errorf("unmarshal import job payload: %w", err)
	}

	if _, err := h.queries.UpdateImportJobToFetching(ctx, payload.ImportJobID); err != nil {
		return fmt.Errorf("update import job to fetching: %w", err)
	}

	// На этом шаге только orchestration skeleton.
	time.Sleep(1 * time.Second)

	if _, err := h.queries.UpdateImportJobToImporting(ctx, payload.ImportJobID); err != nil {
		return fmt.Errorf("update import job to importing: %w", err)
	}

	// На этом шаге пока без реального fetch/import.
	time.Sleep(1 * time.Second)

	if _, err := h.queries.UpdateImportJobToCompleted(ctx, dbgen.UpdateImportJobToCompletedParams{
		ID:              payload.ImportJobID,
		RecordsReceived: 0,
		RecordsImported: 0,
		RecordsFailed:   0,
	}); err != nil {
		return fmt.Errorf("update import job to completed: %w", err)
	}

	h.log.Info("ozon import job completed",
		zap.String("domain", h.domain),
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int64("import_job_id", payload.ImportJobID),
	)

	return nil
}
