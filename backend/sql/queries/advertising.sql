-- name: UpsertAdCampaign :one
INSERT INTO ad_campaigns (
    seller_account_id,
    campaign_external_id,
    campaign_name,
    campaign_type,
    placement_type,
    status,
    budget_amount,
    budget_daily,
    raw_attributes,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
)
ON CONFLICT (seller_account_id, campaign_external_id)
DO UPDATE SET
    campaign_name = EXCLUDED.campaign_name,
    campaign_type = EXCLUDED.campaign_type,
    placement_type = EXCLUDED.placement_type,
    status = EXCLUDED.status,
    budget_amount = EXCLUDED.budget_amount,
    budget_daily = EXCLUDED.budget_daily,
    raw_attributes = EXCLUDED.raw_attributes,
    updated_at = NOW()
RETURNING *;

-- name: UpsertAdMetricDaily :one
INSERT INTO ad_metrics_daily (
    seller_account_id,
    campaign_external_id,
    metric_date,
    impressions,
    clicks,
    spend,
    orders_count,
    revenue,
    raw_attributes,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
)
ON CONFLICT (seller_account_id, campaign_external_id, metric_date)
DO UPDATE SET
    impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    spend = EXCLUDED.spend,
    orders_count = EXCLUDED.orders_count,
    revenue = EXCLUDED.revenue,
    raw_attributes = EXCLUDED.raw_attributes,
    updated_at = NOW()
RETURNING *;

-- name: UpsertAdCampaignSKU :one
INSERT INTO ad_campaign_skus (
    seller_account_id,
    campaign_external_id,
    ozon_product_id,
    offer_id,
    sku,
    is_active,
    status,
    raw_attributes,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, NOW()
)
ON CONFLICT (seller_account_id, campaign_external_id, ozon_product_id)
DO UPDATE SET
    offer_id = EXCLUDED.offer_id,
    sku = EXCLUDED.sku,
    is_active = EXCLUDED.is_active,
    status = EXCLUDED.status,
    raw_attributes = EXCLUDED.raw_attributes,
    updated_at = NOW()
RETURNING *;

-- name: ListAdCampaignSummariesBySellerAndDateRange :many
SELECT
    c.seller_account_id,
    c.campaign_external_id,
    c.campaign_name,
    c.campaign_type,
    c.placement_type,
    c.status,
    c.budget_amount,
    c.budget_daily,
    COALESCE(SUM(m.impressions), 0)::bigint AS impressions_total,
    COALESCE(SUM(m.clicks), 0)::bigint AS clicks_total,
    COALESCE(SUM(m.spend), 0)::numeric(18,2) AS spend_total,
    COALESCE(SUM(m.orders_count), 0)::bigint AS orders_total,
    COALESCE(SUM(m.revenue), 0)::numeric(18,2) AS revenue_total,
    MAX(m.metric_date)::date AS latest_metric_date
FROM ad_campaigns c
LEFT JOIN ad_metrics_daily m
    ON m.seller_account_id = c.seller_account_id
   AND m.campaign_external_id = c.campaign_external_id
   AND m.metric_date >= sqlc.arg(date_from)::date
   AND m.metric_date <= sqlc.arg(date_to)::date
WHERE c.seller_account_id = $1
GROUP BY
    c.seller_account_id,
    c.campaign_external_id,
    c.campaign_name,
    c.campaign_type,
    c.placement_type,
    c.status,
    c.budget_amount,
    c.budget_daily
ORDER BY spend_total DESC, c.campaign_external_id ASC;

-- name: ListAdMetricsDailyBySellerAndDateRange :many
SELECT *
FROM ad_metrics_daily
WHERE seller_account_id = $1
  AND metric_date >= sqlc.arg(date_from)::date
  AND metric_date <= sqlc.arg(date_to)::date
ORDER BY metric_date ASC, campaign_external_id ASC;

-- name: ListAdCampaignSKUMappingsBySellerAccountID :many
SELECT
    l.*,
    c.campaign_name,
    c.status AS campaign_status,
    p.name AS product_name
FROM ad_campaign_skus l
LEFT JOIN ad_campaigns c
    ON c.seller_account_id = l.seller_account_id
   AND c.campaign_external_id = l.campaign_external_id
LEFT JOIN products p
    ON p.seller_account_id = l.seller_account_id
   AND p.ozon_product_id = l.ozon_product_id
WHERE l.seller_account_id = $1
ORDER BY l.campaign_external_id ASC, l.ozon_product_id ASC;
