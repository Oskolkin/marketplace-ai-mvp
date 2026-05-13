-- name: CreateOzonConnection :one
INSERT INTO ozon_connections (
    seller_account_id,
    client_id_encrypted,
    api_key_encrypted,
    status,
    last_check_at,
    last_check_result,
    last_error
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: GetOzonConnectionBySellerAccountID :one
SELECT * FROM ozon_connections
WHERE seller_account_id = $1
LIMIT 1;

-- name: UpdateOzonConnectionCredentials :one
UPDATE ozon_connections
SET
    client_id_encrypted = $2,
    api_key_encrypted = $3,
    status = $4,
    last_check_at = $5,
    last_check_result = $6,
    last_error = $7,
    updated_at = NOW()
WHERE seller_account_id = $1
RETURNING *;

-- name: UpdateOzonConnectionCheckResult :one
UPDATE ozon_connections
SET
    status = $2,
    last_check_at = $3,
    last_check_result = $4,
    last_error = $5,
    updated_at = NOW()
WHERE seller_account_id = $1
RETURNING *;

-- name: UpdateOzonConnectionStatus :one
UPDATE ozon_connections
SET
    status = $2,
    updated_at = NOW()
WHERE seller_account_id = $1
RETURNING *;

-- name: UpdateOzonPerformanceBearerToken :one
UPDATE ozon_connections
SET
    performance_token_encrypted = $2,
    performance_status = 'unknown',
    performance_last_check_at = NULL,
    performance_last_check_result = NULL,
    performance_last_error = NULL,
    updated_at = NOW()
WHERE seller_account_id = $1
RETURNING *;

-- name: ClearOzonPerformanceBearerToken :one
UPDATE ozon_connections
SET
    performance_token_encrypted = NULL,
    performance_status = 'not_configured',
    performance_last_check_at = NULL,
    performance_last_check_result = NULL,
    performance_last_error = NULL,
    updated_at = NOW()
WHERE seller_account_id = $1
RETURNING *;

-- name: UpdateOzonPerformanceCheckResult :one
UPDATE ozon_connections
SET
    performance_status = $2,
    performance_last_check_at = $3,
    performance_last_check_result = $4,
    performance_last_error = $5,
    updated_at = NOW()
WHERE seller_account_id = $1
RETURNING *;