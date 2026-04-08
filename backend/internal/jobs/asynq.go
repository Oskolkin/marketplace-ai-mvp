package jobs

import (
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
)

const (
	TypeSystemPing = "system.ping"
)

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type SystemPingPayload struct {
	Message string `json:"message"`
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

const TaskTypeOzonInitialSync = "ozon.initial_sync"

type OzonInitialSyncPayload struct {
	SellerAccountID int64 `json:"seller_account_id"`
	SyncJobID       int64 `json:"sync_job_id"`
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

const (
	TaskTypeOzonSyncCoordinator = "ozon.sync_coordinator"
	TaskTypeOzonImportProducts  = "ozon.import_products"
	TaskTypeOzonImportOrders    = "ozon.import_orders"
	TaskTypeOzonImportStocks    = "ozon.import_stocks"
)

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
	payload, err := json.Marshal(OzonImportJobPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
		ImportJobID:     importJobID,
		Domain:          "products",
	})
	if err != nil {
		return nil, fmt.Errorf("marshal products import payload: %w", err)
	}

	return asynq.NewTask(TaskTypeOzonImportProducts, payload), nil
}

func NewOzonImportOrdersTask(sellerAccountID, syncJobID, importJobID int64) (*asynq.Task, error) {
	payload, err := json.Marshal(OzonImportJobPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
		ImportJobID:     importJobID,
		Domain:          "orders",
	})
	if err != nil {
		return nil, fmt.Errorf("marshal orders import payload: %w", err)
	}

	return asynq.NewTask(TaskTypeOzonImportOrders, payload), nil
}

func NewOzonImportStocksTask(sellerAccountID, syncJobID, importJobID int64) (*asynq.Task, error) {
	payload, err := json.Marshal(OzonImportJobPayload{
		SellerAccountID: sellerAccountID,
		SyncJobID:       syncJobID,
		ImportJobID:     importJobID,
		Domain:          "stocks",
	})
	if err != nil {
		return nil, fmt.Errorf("marshal stocks import payload: %w", err)
	}

	return asynq.NewTask(TaskTypeOzonImportStocks, payload), nil
}
