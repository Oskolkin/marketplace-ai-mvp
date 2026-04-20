package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/adsync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/ordersync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/productsync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/stocksync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/syncstate"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type OzonImportHandler struct {
	queries          *dbgen.Queries
	cursorService    *syncstate.SyncCursorService
	productsImporter *productsync.Service
	ordersImporter   *ordersync.Service
	stocksImporter   *stocksync.Service
	adsImporter      *adsync.Service
	log              *zap.Logger
	domain           string
}

func NewOzonImportHandler(
	db *pgxpool.Pool,
	log *zap.Logger,
	domain string,
	productsImporter *productsync.Service,
	ordersImporter *ordersync.Service,
	stocksImporter *stocksync.Service,
	adsImporter *adsync.Service,
) *OzonImportHandler {
	return &OzonImportHandler{
		queries:          dbgen.New(db),
		cursorService:    syncstate.NewSyncCursorService(db),
		productsImporter: productsImporter,
		ordersImporter:   ordersImporter,
		stocksImporter:   stocksImporter,
		adsImporter:      adsImporter,
		log:              log,
		domain:           domain,
	}
}

func (h *OzonImportHandler) Handle(ctx context.Context, taskPayload []byte) error {
	var payload OzonImportJobPayload
	if err := json.Unmarshal(taskPayload, &payload); err != nil {
		return fmt.Errorf("unmarshal import job payload: %w", err)
	}

	importJob, err := h.queries.UpdateImportJobToFetching(ctx, payload.ImportJobID)
	if err != nil {
		return fmt.Errorf("update import job to fetching: %w", err)
	}

	h.log.Info("ozon import job fetching started",
		zap.String("domain", h.domain),
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int64("import_job_id", payload.ImportJobID),
		zap.Bool("source_cursor_present", importJob.SourceCursor.Valid),
		zap.String("source_cursor", importJob.SourceCursor.String),
	)

	if _, err := h.queries.UpdateImportJobToImporting(ctx, payload.ImportJobID); err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("update import job to importing: %w", err)
	}

	switch h.domain {
	case "products":
		return h.handleProducts(ctx, payload, importJob)

	case "orders":
		return h.handleOrders(ctx, payload, importJob)

	case "stocks":
		return h.handleStocks(ctx, payload, importJob)

	case "ads":
		return h.handleAds(ctx, payload, importJob)

	default:
		err := fmt.Errorf("unsupported domain: %s", h.domain)
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return err
	}
}

func (h *OzonImportHandler) handleProducts(
	ctx context.Context,
	payload OzonImportJobPayload,
	importJob dbgen.ImportJob,
) error {
	if h.productsImporter == nil {
		err := fmt.Errorf("products importer is nil")
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return err
	}

	result, err := h.productsImporter.Run(ctx, productsync.RunInput{
		SellerAccountID: payload.SellerAccountID,
		ImportJobID:     payload.ImportJobID,
		SourceCursor:    importJob.SourceCursor.String,
	})
	if err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("run products import: %w", err)
	}

	if err := h.completeImport(
		ctx,
		payload,
		result.NextCursorValue,
		result.RecordsReceived,
		result.RecordsImported,
		result.RecordsFailed,
	); err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("complete products import: %w", err)
	}

	h.log.Info("ozon products import completed",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int64("import_job_id", payload.ImportJobID),
		zap.Int32("records_received", result.RecordsReceived),
		zap.Int32("records_imported", result.RecordsImported),
		zap.String("next_cursor_value", result.NextCursorValue),
	)

	return nil
}

func (h *OzonImportHandler) handleOrders(
	ctx context.Context,
	payload OzonImportJobPayload,
	importJob dbgen.ImportJob,
) error {
	if h.ordersImporter == nil {
		err := fmt.Errorf("orders importer is nil")
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return err
	}

	result, err := h.ordersImporter.Run(ctx, ordersync.RunInput{
		SellerAccountID: payload.SellerAccountID,
		ImportJobID:     payload.ImportJobID,
		SourceCursor:    importJob.SourceCursor.String,
	})
	if err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("run orders import: %w", err)
	}

	if err := h.completeImport(
		ctx,
		payload,
		result.NextCursorValue,
		result.RecordsReceived,
		result.RecordsImported,
		result.RecordsFailed,
	); err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("complete orders import: %w", err)
	}

	h.log.Info("ozon orders import completed",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int64("import_job_id", payload.ImportJobID),
		zap.Int32("records_received", result.RecordsReceived),
		zap.Int32("records_imported", result.RecordsImported),
		zap.String("next_cursor_value", result.NextCursorValue),
	)

	return nil
}

func (h *OzonImportHandler) handleStocks(
	ctx context.Context,
	payload OzonImportJobPayload,
	importJob dbgen.ImportJob,
) error {
	if h.stocksImporter == nil {
		err := fmt.Errorf("stocks importer is nil")
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return err
	}

	result, err := h.stocksImporter.Run(ctx, stocksync.RunInput{
		SellerAccountID: payload.SellerAccountID,
		ImportJobID:     payload.ImportJobID,
		SourceCursor:    importJob.SourceCursor.String,
	})
	if err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("run stocks import: %w", err)
	}

	if err := h.completeImport(
		ctx,
		payload,
		result.NextCursorValue,
		result.RecordsReceived,
		result.RecordsImported,
		result.RecordsFailed,
	); err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("complete stocks import: %w", err)
	}

	h.log.Info("ozon stocks import completed",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int64("import_job_id", payload.ImportJobID),
		zap.Int32("records_received", result.RecordsReceived),
		zap.Int32("records_imported", result.RecordsImported),
		zap.String("next_cursor_value", result.NextCursorValue),
	)

	return nil
}

func (h *OzonImportHandler) handleAds(
	ctx context.Context,
	payload OzonImportJobPayload,
	importJob dbgen.ImportJob,
) error {
	if h.adsImporter == nil {
		err := fmt.Errorf("ads importer is nil")
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return err
	}

	result, err := h.adsImporter.Run(ctx, adsync.RunInput{
		SellerAccountID: payload.SellerAccountID,
		ImportJobID:     payload.ImportJobID,
		SourceCursor:    importJob.SourceCursor.String,
	})
	if err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("run ads import: %w", err)
	}

	if err := h.completeImport(
		ctx,
		payload,
		result.NextCursorValue,
		result.RecordsReceived,
		result.RecordsImported,
		result.RecordsFailed,
	); err != nil {
		_ = h.failImport(ctx, payload.ImportJobID, err)
		return fmt.Errorf("complete ads import: %w", err)
	}

	h.log.Info("ozon ads import placeholder completed",
		zap.Int64("seller_account_id", payload.SellerAccountID),
		zap.Int64("sync_job_id", payload.SyncJobID),
		zap.Int64("import_job_id", payload.ImportJobID),
		zap.Int32("records_received", result.RecordsReceived),
		zap.Int32("records_imported", result.RecordsImported),
		zap.String("next_cursor_value", result.NextCursorValue),
	)

	return nil
}

func (h *OzonImportHandler) completeImport(
	ctx context.Context,
	payload OzonImportJobPayload,
	nextCursorValue string,
	recordsReceived int32,
	recordsImported int32,
	recordsFailed int32,
) error {
	if nextCursorValue != "" {
		if _, err := h.cursorService.AdvanceCursor(
			ctx,
			payload.SellerAccountID,
			payload.Domain,
			nextCursorValue,
		); err != nil {
			return fmt.Errorf("advance cursor: %w", err)
		}
	}

	if _, err := h.queries.UpdateImportJobToCompleted(ctx, dbgen.UpdateImportJobToCompletedParams{
		ID:              payload.ImportJobID,
		RecordsReceived: recordsReceived,
		RecordsImported: recordsImported,
		RecordsFailed:   recordsFailed,
	}); err != nil {
		return fmt.Errorf("update import job to completed: %w", err)
	}

	return nil
}

func (h *OzonImportHandler) failImport(ctx context.Context, importJobID int64, cause error) error {
	_, err := h.queries.UpdateImportJobToFailed(ctx, dbgen.UpdateImportJobToFailedParams{
		ID: importJobID,
		ErrorMessage: pgtype.Text{
			String: cause.Error(),
			Valid:  true,
		},
	})
	return err
}
