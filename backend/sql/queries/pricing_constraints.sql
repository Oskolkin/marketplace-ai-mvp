-- name: CreatePricingConstraintRule :one
INSERT INTO pricing_constraint_rules (
    seller_account_id,
    scope_type,
    scope_target_id,
    scope_target_code,
    min_price,
    max_price,
    reference_margin_percent,
    reference_price,
    implied_cost,
    is_active,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
)
RETURNING *;

-- name: UpdatePricingConstraintRule :one
UPDATE pricing_constraint_rules
SET
    scope_type = $2,
    scope_target_id = $3,
    scope_target_code = $4,
    min_price = $5,
    max_price = $6,
    reference_margin_percent = $7,
    reference_price = $8,
    implied_cost = $9,
    is_active = $10,
    updated_at = NOW()
WHERE id = $1
  AND seller_account_id = $11
RETURNING *;

-- name: ListPricingConstraintRulesBySellerAccountID :many
SELECT *
FROM pricing_constraint_rules
WHERE seller_account_id = $1
ORDER BY scope_type ASC, id ASC;

-- name: ListPricingConstraintRulesByScope :many
SELECT *
FROM pricing_constraint_rules
WHERE seller_account_id = $1
  AND scope_type = $2
  AND (
    scope_target_id = sqlc.narg(scope_target_id)
    OR (
      sqlc.narg(scope_target_id)::bigint IS NULL
      AND scope_target_id IS NULL
    )
  )
  AND (
    scope_target_code = sqlc.narg(scope_target_code)
    OR (
      sqlc.narg(scope_target_code)::text IS NULL
      AND scope_target_code IS NULL
    )
  )
ORDER BY is_active DESC, updated_at DESC, id DESC;

-- name: UpsertSKUEffectiveConstraint :one
INSERT INTO sku_effective_constraints (
    seller_account_id,
    ozon_product_id,
    sku,
    offer_id,
    resolved_from_scope_type,
    rule_id,
    effective_min_price,
    effective_max_price,
    reference_price,
    reference_margin_percent,
    implied_cost,
    computed_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
)
ON CONFLICT (seller_account_id, ozon_product_id)
DO UPDATE SET
    sku = EXCLUDED.sku,
    offer_id = EXCLUDED.offer_id,
    resolved_from_scope_type = EXCLUDED.resolved_from_scope_type,
    rule_id = EXCLUDED.rule_id,
    effective_min_price = EXCLUDED.effective_min_price,
    effective_max_price = EXCLUDED.effective_max_price,
    reference_price = EXCLUDED.reference_price,
    reference_margin_percent = EXCLUDED.reference_margin_percent,
    implied_cost = EXCLUDED.implied_cost,
    computed_at = NOW()
RETURNING *;

-- name: DeleteSKUEffectiveConstraintsBySellerAccountID :exec
DELETE FROM sku_effective_constraints
WHERE seller_account_id = $1;

-- name: ListSKUEffectiveConstraintsBySellerAccountID :many
SELECT *
FROM sku_effective_constraints
WHERE seller_account_id = $1
ORDER BY computed_at DESC, ozon_product_id ASC;

-- name: GetSKUEffectiveConstraintBySellerAndProduct :one
SELECT *
FROM sku_effective_constraints
WHERE seller_account_id = $1
  AND ozon_product_id = $2;

-- name: GetSKUEffectiveConstraintBySellerAndSKU :one
SELECT *
FROM sku_effective_constraints
WHERE seller_account_id = $1
  AND sku = $2
ORDER BY computed_at DESC
LIMIT 1;
