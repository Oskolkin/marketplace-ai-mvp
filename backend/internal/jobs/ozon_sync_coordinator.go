package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type OzonSyncCoordinatorHandler struct {
	queries     *dbgen.Queries
	asynqClient *asynq.Client
	log         *zap.Logger
}

func NewOzonSyncCoordinatorHandler(db *pgxpool.Pool, asynqClient *asynq.Client, log *zap.Logger) *OzonSyncCoordinatorHandler {
	return &OzonSyncCoordinatorHandler{
		queries:     dbgen.New(db),
		asynqClient: asynqClient,
		log:         log,
	}
}

func (h *OzonSyncCoordinatorHandler) Handle(ctx context.Context, taskPayload []byte) error {
	var payload OzonSyncCoordinatorPayload
	if err := json.Unmarshal(taskPayload, &payload); err != nil {
		return fmt.Errorf("unmarshal sync coordinator payload: %w", err)
	}

	if _, err := h.queries.UpdateSyncJobToRunning(ctx, payload.SyncJobID); err != nil {
		return fmt.Errorf("update sync job to running: %w", err)
	}

	domains := []string{"products", "orders", "stocks"}

	for _, domain := range domains {
		importJob, err := h.queries.CreateImportJob(ctx, dbgen.CreateImportJobParams{
			SellerAccountID: payload.SellerAccountID,
			SyncJobID:       payload.SyncJobID,
			Domain:          domain,
			Status:          "pending",
			SourceCursor:    pgtype.Text{Valid: false},
			RecordsReceived: 0,
			RecordsImported: 0,
			RecordsFailed:   0,
			StartedAt:       pgtype.Timestamptz{Valid: false},
			FinishedAt:      pgtype.Timestamptz{Valid: false},
			ErrorMessage:    pgtype.Text{Valid: false},
		})
		if err != nil {
			return fmt.Errorf("create import job for %s: %w", domain, err)
		}

		var task *asynq.Task

		switch domain {
		case "products":
			task, err = NewOzonImportProductsTask(payload.SellerAccountID, payload.SyncJobID, importJob.ID)
		case "orders":
			task, err = NewOzonImportOrdersTask(payload.SellerAccountID, payload.SyncJobID, importJob.ID)
		case "stocks":
			task, err = NewOzonImportStocksTask(payload.SellerAccountID, payload.SyncJobID, importJob.ID)
		default:
			return fmt.Errorf("unsupported domain: %s", domain)
		}
		if err != nil {
			return fmt.Errorf("create import task for %s: %w", domain, err)
		}

		if _, err := h.asynqClient.Enqueue(task); err != nil {
			return fmt.Errorf("enqueue import task for %s: %w", domain, err)
		}
	}

	h.log.Info("ozon sync coordinator dispatched import jobs",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.String("sync_type", payload.SyncType),
	)

	return nil
}
