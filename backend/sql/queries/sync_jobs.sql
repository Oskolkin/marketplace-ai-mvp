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
ORDER BY created_at DESC
LIMIT 1;

-- name: UpdateSyncJobToRunning :one
UPDATE sync_jobs
SET
    status = 'running',
    started_at = NOW()
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