package ozon

import (
	"context"
	"fmt"
)

type ListAdCampaignsRequest struct {
	Since string
	To    string
}

type AdCampaignItem struct {
	CampaignID int64  `json:"campaign_id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	Type       string `json:"type"`
	UpdatedAt  string `json:"updated_at"`
}

type ListAdCampaignsResult struct {
	Items []AdCampaignItem `json:"items"`
}

type ListAdCampaignMetricsRequest struct {
	Since string
	To    string
}

type AdCampaignMetricItem struct {
	CampaignID int64  `json:"campaign_id"`
	Date       string `json:"date"`
	Spend      string `json:"spend"`
	Clicks     int64  `json:"clicks"`
	Orders     int64  `json:"orders"`
}

type ListAdCampaignMetricsResult struct {
	Items []AdCampaignMetricItem `json:"items"`
}

type ListAdSkuMetricsRequest struct {
	Since string
	To    string
}

type AdSkuMetricItem struct {
	CampaignID int64  `json:"campaign_id"`
	SKU        int64  `json:"sku"`
	Date       string `json:"date"`
	Spend      string `json:"spend"`
	Clicks     int64  `json:"clicks"`
	Orders     int64  `json:"orders"`
}

type ListAdSkuMetricsResult struct {
	Items []AdSkuMetricItem `json:"items"`
}

func (c *Client) ListAdCampaigns(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListAdCampaignsRequest,
) (*TypedResponse[ListAdCampaignsResult], error) {
	return nil, fmt.Errorf("ads client scaffold only: ListAdCampaigns is not implemented yet")
}

func (c *Client) ListAdCampaignMetrics(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListAdCampaignMetricsRequest,
) (*TypedResponse[ListAdCampaignMetricsResult], error) {
	return nil, fmt.Errorf("ads client scaffold only: ListAdCampaignMetrics is not implemented yet")
}

func (c *Client) ListAdSkuMetrics(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListAdSkuMetricsRequest,
) (*TypedResponse[ListAdSkuMetricsResult], error) {
	return nil, fmt.Errorf("ads client scaffold only: ListAdSkuMetrics is not implemented yet")
}
