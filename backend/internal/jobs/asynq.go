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
