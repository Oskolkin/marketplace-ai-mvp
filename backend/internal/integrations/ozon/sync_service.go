package ozon

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrConnectionNotValid     = errors.New("ozon connection is not valid")
	ErrInitialSyncAlreadyBusy = errors.New("initial sync is already running or pending")
)

type SyncService struct {
	db          *pgxpool.Pool
	queries     *dbgen.Queries
	asynqClient *asynq.Client
}

func NewSyncService(db *pgxpool.Pool, asynqClient *asynq.Client) *SyncService {
	return &SyncService{
		db:          db,
		queries:     dbgen.New(db),
		asynqClient: asynqClient,
	}
}

type StatusResult struct {
	ConnectionStatus  string  `json:"connection_status"`
	LastCheckAt       *string `json:"last_check_at"`
	LastCheckResult   *string `json:"last_check_result"`
	LastError         *string `json:"last_error"`
	InitialSyncStatus *string `json:"initial_sync_status"`
	LastSyncError     *string `json:"last_sync_error"`
}

func (s *SyncService) StartInitialSync(ctx context.Context, sellerAccountID int64) (dbgen.SyncJob, error) {
	connection, err := s.queries.GetOzonConnectionBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbgen.SyncJob{}, ErrConnectionNotFound
		}
		return dbgen.SyncJob{}, fmt.Errorf("get ozon connection: %w", err)
	}

	if connection.Status != "valid" {
		return dbgen.SyncJob{}, ErrConnectionNotValid
	}

	latestJob, err := s.queries.GetLatestSyncJobBySellerAccountIDAndType(ctx, dbgen.GetLatestSyncJobBySellerAccountIDAndTypeParams{
		SellerAccountID: sellerAccountID,
		Type:            "initial_sync",
	})
	if err == nil {
		if latestJob.Status == "pending" || latestJob.Status == "running" {
			return dbgen.SyncJob{}, ErrInitialSyncAlreadyBusy
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return dbgen.SyncJob{}, fmt.Errorf("get latest sync job: %w", err)
	}

	job, err := s.queries.CreateSyncJob(ctx, dbgen.CreateSyncJobParams{
		SellerAccountID: sellerAccountID,
		Type:            "initial_sync",
		Status:          "pending",
		StartedAt:       pgtype.Timestamptz{Valid: false},
		FinishedAt:      pgtype.Timestamptz{Valid: false},
		ErrorMessage:    pgtype.Text{Valid: false},
	})
	if err != nil {
		return dbgen.SyncJob{}, fmt.Errorf("create sync job: %w", err)
	}

	_, err = s.queries.UpdateOzonConnectionStatus(ctx, dbgen.UpdateOzonConnectionStatusParams{
		SellerAccountID: sellerAccountID,
		Status:          "sync_pending",
	})
	if err != nil {
		return dbgen.SyncJob{}, fmt.Errorf("update ozon connection status to sync_pending: %w", err)
	}

	task, err := jobs.NewOzonInitialSyncTask(sellerAccountID, job.ID)
	if err != nil {
		return dbgen.SyncJob{}, fmt.Errorf("create initial sync task: %w", err)
	}

	if _, err := s.asynqClient.Enqueue(task); err != nil {
		return dbgen.SyncJob{}, fmt.Errorf("enqueue initial sync task: %w", err)
	}

	return job, nil
}

func (s *SyncService) GetStatus(ctx context.Context, sellerAccountID int64) (StatusResult, error) {
	connection, err := s.queries.GetOzonConnectionBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return StatusResult{}, ErrConnectionNotFound
		}
		return StatusResult{}, fmt.Errorf("get ozon connection: %w", err)
	}

	result := StatusResult{
		ConnectionStatus: connection.Status,
	}

	if connection.LastCheckAt.Valid {
		v := connection.LastCheckAt.Time.Format(time.RFC3339)
		result.LastCheckAt = &v
	}
	if connection.LastCheckResult.Valid {
		v := connection.LastCheckResult.String
		result.LastCheckResult = &v
	}
	if connection.LastError.Valid {
		v := connection.LastError.String
		result.LastError = &v
	}

	latestJob, err := s.queries.GetLatestSyncJobBySellerAccountIDAndType(ctx, dbgen.GetLatestSyncJobBySellerAccountIDAndTypeParams{
		SellerAccountID: sellerAccountID,
		Type:            "initial_sync",
	})
	if err == nil {
		v := latestJob.Status
		result.InitialSyncStatus = &v

		if latestJob.ErrorMessage.Valid {
			e := latestJob.ErrorMessage.String
			result.LastSyncError = &e
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return StatusResult{}, fmt.Errorf("get latest sync job: %w", err)
	}

	return result, nil
}
