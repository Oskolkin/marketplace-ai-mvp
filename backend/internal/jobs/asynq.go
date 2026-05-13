package jobs

import (
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
)

const (
	TypeSystemPing          = "system.ping"
	TaskTypeOzonInitialSync = "ozon.initial_sync"

	TaskTypeOzonSyncCoordinator = "ozon.sync_coordinator"
	TaskTypeOzonImportProducts  = "ozon.import.products"
	TaskTypeOzonImportOrders    = "ozon.import.orders"
	TaskTypeOzonImportStocks    = "ozon.import.stocks"
	TaskTypeOzonImportAds       = "ozon.import.ads"
	// TaskTypePostSyncRecalculation runs metrics rebuild + alerts after a sync_job reaches completed.
	TaskTypePostSyncRecalculation = "ozon.post_sync_recalculation"
)

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type SystemPingPayload struct {
	Message string `json:"message"`
}

type OzonInitialSyncPayload struct {
	SellerAccountID int64 `json:"seller_account_id"`
	SyncJobID       int64 `json:"sync_job_id"`
}

type OzonSyncCoordinatorPayload struct {
	SellerAccountID int64  `json:"seller_account_id"`
	SyncJobID       int64  `json:"sync_job_id"`
	SyncType        string `json:"sync_type"`
}

type OzonImportJobPayload struct {
	SellerAccountID int64  `json:"seller_account_id"`
	SyncJobID       int64  `json:"sync_job_id"`
	ImportJobID     int64  `json:"import_job_id"`
	Domain          string `json:"domain"`
}

// RecalculateAfterSyncPayload is processed after ingestion completes a sync_job (status completed).
type RecalculateAfterSyncPayload struct {
	SellerAccountID int64 `json:"seller_account_id"`
	SyncJobID       int64 `json:"sync_job_id"`
}

func NewAsynqClient(cfg RedisConfig) *asynq.Client {
	return asynq.NewClient(asynq.RedisClientOpt{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})
}

func NewAsynqServer(cfg RedisConfig) *asynq.Server {
	return asynq.NewServer(
		asynq.RedisClientOpt{
			Addr:     cfg.Addr,
			Password: cfg.Password,
			DB:       cfg.DB,
		},
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				"default": 1,
			},
		},
	)
}

func NewSystemPingTask(message string) (*asynq.Task, error) {
	payload, err := json.Marshal(SystemPingPayload{
		Message: message,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal system ping payload: %w", err)
	}

	return asynq.NewTask(TypeSystemPing, payload), nil
}

func NewOzonInitialSyncTask(sellerAccountID, syncJobID int64) (*asynq.Task, error) {
	payload, err := json.Marshal(OzonInitialSyncPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal ozon initial sync payload: %w", err)
	}

	return asynq.NewTask(TaskTypeOzonInitialSync, payload), nil
}

func NewOzonSyncCoordinatorTask(sellerAccountID, syncJobID int64, syncType string) (*asynq.Task, error) {
	payload, err := json.Marshal(OzonSyncCoordinatorPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
		SyncType:        syncType,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal ozon sync coordinator payload: %w", err)
	}

	return asynq.NewTask(TaskTypeOzonSyncCoordinator, payload), nil
}

func NewOzonImportProductsTask(sellerAccountID, syncJobID, importJobID int64) (*asynq.Task, error) {
	return newOzonImportTask(TaskTypeOzonImportProducts, sellerAccountID, syncJobID, importJobID, "products")
}

func NewOzonImportOrdersTask(sellerAccountID, syncJobID, importJobID int64) (*asynq.Task, error) {
	return newOzonImportTask(TaskTypeOzonImportOrders, sellerAccountID, syncJobID, importJobID, "orders")
}

func NewOzonImportStocksTask(sellerAccountID, syncJobID, importJobID int64) (*asynq.Task, error) {
	return newOzonImportTask(TaskTypeOzonImportStocks, sellerAccountID, syncJobID, importJobID, "stocks")
}

func NewOzonImportAdsTask(sellerAccountID, syncJobID, importJobID int64) (*asynq.Task, error) {
	return newOzonImportTask(TaskTypeOzonImportAds, sellerAccountID, syncJobID, importJobID, "ads")
}

func newOzonImportTask(taskType string, sellerAccountID, syncJobID, importJobID int64, domain string) (*asynq.Task, error) {
	payload, err := json.Marshal(OzonImportJobPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
		ImportJobID:     importJobID,
		Domain:          domain,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal ozon import payload for %s: %w", domain, err)
	}

	return asynq.NewTask(taskType, payload), nil
}

// NewRecalculateAfterSyncTask enqueues downstream metrics + alerts for a completed sync_job.
func NewRecalculateAfterSyncTask(sellerAccountID, syncJobID int64) (*asynq.Task, error) {
	payload, err := json.Marshal(RecalculateAfterSyncPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal post-sync recalculation payload: %w", err)
	}
	return asynq.NewTask(TaskTypePostSyncRecalculation, payload), nil
}
