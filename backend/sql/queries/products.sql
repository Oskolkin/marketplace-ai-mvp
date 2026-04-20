-- name: UpsertProduct :one
INSERT INTO products (
    seller_account_id,
    ozon_product_id,
    offer_id,
    sku,
    name,
    status,
    is_archived,
    raw_attributes,
    source_updated_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
)
ON CONFLICT (seller_account_id, ozon_product_id)
DO UPDATE SET
    offer_id = EXCLUDED.offer_id,
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    is_archived = EXCLUDED.is_archived,
    raw_attributes = EXCLUDED.raw_attributes,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = NOW()
RETURNING *;

-- name: ListProductsBySellerAccountID :many
SELECT *
FROM products
WHERE seller_account_id = $1
ORDER BY id ASC;

-- name: CountProductsBySellerAccountID :one
SELECT COUNT(*)
FROM products
WHERE seller_account_id = $1;