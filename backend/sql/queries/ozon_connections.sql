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