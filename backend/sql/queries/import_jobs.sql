-- name: CreateImportJob :one
INSERT INTO import_jobs (
    seller_account_id,
    sync_job_id,
    domain,
    status,
    source_cursor,
    records_received,
    records_imported,
    records_failed,
    started_at,
    finished_at,
    error_message,
    created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
)
RETURNING *;

-- name: ListImportJobsBySyncJobID :many
SELECT *
FROM import_jobs
WHERE sync_job_id = $1
ORDER BY id ASC;

-- name: GetImportJobByID :one
SELECT *
FROM import_jobs
WHERE id = $1
LIMIT 1;

-- name: UpdateImportJobToFetching :one
UPDATE import_jobs
SET
    status = 'fetching',
    started_at = NOW(),
    error_message = NULL
WHERE id = $1
RETURNING *;

-- name: UpdateImportJobToImporting :one
UPDATE import_jobs
SET
    status = 'importing'
WHERE id = $1
RETURNING *;

-- name: UpdateImportJobToCompleted :one
UPDATE import_jobs
SET
    status = 'completed',
    finished_at = NOW(),
    records_received = $2,
    records_imported = $3,
    records_failed = $4,
    error_message = NULL
WHERE id = $1
RETURNING *;

-- name: UpdateImportJobToFailed :one
UPDATE import_jobs
SET
    status = 'failed',
    finished_at = NOW(),
    error_message = $2
WHERE id = $1
RETURNING *;