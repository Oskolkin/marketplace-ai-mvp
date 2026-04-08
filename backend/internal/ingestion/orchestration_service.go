package ingestion

import (
	"context"
	"errors"
	"fmt"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSyncAlreadyRunning = errors.New("sync job is already running")

type OrchestrationService struct {
	db          *pgxpool.Pool
	queries     *dbgen.Queries
	asynqClient *asynq.Client
}

func NewOrchestrationService(db *pgxpool.Pool, asynqClient *asynq.Client) *OrchestrationService {
	return &OrchestrationService{
		db:          db,
		queries:     dbgen.New(db),
		asynqClient: asynqClient,
	}
}

func (s *OrchestrationService) StartInitialSync(ctx context.Context, sellerAccountID int64) (dbgen.SyncJob, error) {
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

	task, err := jobs.NewOzonSyncCoordinatorTask(sellerAccountID, job.ID, "initial_sync")
	if err != nil {
		return dbgen.SyncJob{}, fmt.Errorf("create sync coordinator task: %w", err)
	}

	if _, err := s.asynqClient.Enqueue(task); err != nil {
		return dbgen.SyncJob{}, fmt.Errorf("enqueue sync coordinator task: %w", err)
	}

	return job, nil
}
