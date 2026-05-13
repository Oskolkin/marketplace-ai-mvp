-- name: CreateSyncJob :one
INSERT INTO sync_jobs (
    seller_account_id,
    type,
    status,
    started_at,
    finished_at,
    error_message
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: GetLatestSyncJobBySellerAccountIDAndType :one
SELECT *
FROM sync_jobs
WHERE seller_account_id = $1
  AND type = $2
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: GetLatestSyncJobBySellerAccountID :one
SELECT *
FROM sync_jobs
WHERE seller_account_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: GetLatestCompletedSyncJobBySellerAccountID :one
SELECT *
FROM sync_jobs
WHERE seller_account_id = $1
  AND status = 'completed'
ORDER BY finished_at DESC NULLS LAST, id DESC
LIMIT 1;

-- name: UpdateSyncJobToPending :one
UPDATE sync_jobs
SET
    status = 'pending',
    started_at = NULL,
    finished_at = NULL,
    error_message = NULL
WHERE id = $1
RETURNING *;

-- name: UpdateSyncJobToRunning :one
UPDATE sync_jobs
SET
    status = 'running',
    started_at = NOW(),
    error_message = NULL
WHERE id = $1
RETURNING *;

-- name: UpdateSyncJobToCompleted :one
UPDATE sync_jobs
SET
    status = 'completed',
    finished_at = NOW(),
    error_message = NULL
WHERE id = $1
RETURNING *;

-- name: UpdateSyncJobToFailed :one
UPDATE sync_jobs
SET
    status = 'failed',
    finished_at = NOW(),
    error_message = $2
WHERE id = $1
RETURNING *;

-- name: TryFinalizeSyncJobFailedIfNonTerminal :one
UPDATE sync_jobs
SET
    status = 'failed',
    finished_at = NOW(),
    error_message = $2
WHERE sync_jobs.id = $1
  AND sync_jobs.status NOT IN ('completed', 'failed')
  AND EXISTS (
      SELECT 1
      FROM import_jobs ij
      WHERE ij.sync_job_id = $1
        AND ij.status = 'failed'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM import_jobs ij
      WHERE ij.sync_job_id = $1
        AND ij.status IN ('pending', 'fetching', 'importing')
  )
RETURNING *;

-- name: TryFinalizeSyncJobCompletedIfNonTerminal :one
UPDATE sync_jobs
SET
    status = 'completed',
    finished_at = NOW(),
    error_message = NULL
WHERE sync_jobs.id = $1
  AND sync_jobs.status NOT IN ('completed', 'failed')
  AND EXISTS (
      SELECT 1
      FROM import_jobs ij
      WHERE ij.sync_job_id = $1
  )
  AND NOT EXISTS (
      SELECT 1
      FROM import_jobs ij
      WHERE ij.sync_job_id = $1
        AND ij.status <> 'completed'
  )
RETURNING *;