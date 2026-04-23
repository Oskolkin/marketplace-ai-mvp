package performance

import (
	"encoding/json"
	"time"
)

type TypedResponse[T any] struct {
	Raw  []byte
	Data T
	Meta ResponseMeta
}

type Campaign struct {
	CampaignExternalID int64
	CampaignName       string
	CampaignType       string
	PlacementType      string
	Status             string
	PaymentType        string
	BudgetAmount       string
	BudgetDaily        string
	Raw                json.RawMessage
}

type CampaignDailyMetric struct {
	CampaignExternalID int64
	MetricDate         time.Time
	Impressions        int64
	Clicks             int64
	Spend              string
	OrdersCount        int64
	Revenue            string
	Raw                json.RawMessage
}

type CampaignPromotedProduct struct {
	CampaignExternalID int64
	OzonProductID      int64
	SKU                int64
	Title              string
	IsActive           bool
	Status             string
	Raw                json.RawMessage
}

type ListCampaignsRequest struct {
	CampaignIDs   []int64
	AdvObjectType string
	State         string
	Page          int64
	PageSize      int64
}

type ListCampaignsResult struct {
	Items []Campaign
}

type CampaignStatisticsRequest struct {
	CampaignIDs []int64
	DateFrom    string
	DateTo      string
}

type CampaignStatisticsResult struct {
	Items []CampaignDailyMetric
}

type CampaignProductsRequest struct {
	CampaignID int64
	Page       int64
	PageSize   int64
}

type CampaignProductsResult struct {
	Items []CampaignPromotedProduct
}

type SearchPromoProductsRequest struct {
	Page     int64
	PageSize int64
}
