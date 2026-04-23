package performance

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
)

type Client struct {
	transport *Transport
}

func NewClient() *Client {
	return &Client{
		transport: NewTransport(),
	}
}

func (c *Client) ListCampaigns(
	ctx context.Context,
	_ string,
	bearerToken string,
	req ListCampaignsRequest,
) (*TypedResponse[ListCampaignsResult], error) {
	queryParams := map[string]string{}
	if len(req.CampaignIDs) > 0 {
		ids := ""
		for idx, id := range req.CampaignIDs {
			if idx > 0 {
				ids += ","
			}
			ids += strconv.FormatInt(id, 10)
		}
		queryParams["campaignIds"] = ids
	}
	if req.AdvObjectType != "" {
		queryParams["advObjectType"] = req.AdvObjectType
	}
	if req.State != "" {
		queryParams["state"] = req.State
	}
	if req.Page > 0 {
		queryParams["page"] = strconv.FormatInt(req.Page, 10)
	}
	if req.PageSize > 0 {
		queryParams["pageSize"] = strconv.FormatInt(req.PageSize, 10)
	}

	var decoded map[string]any
	rawResp, err := c.transport.doJSONWithFallbackPaths(
		ctx,
		bearerToken,
		http.MethodGet,
		[]string{"/api/client/campaign"},
		queryParams,
		nil,
		&decoded,
	)
	if err != nil {
		return nil, fmt.Errorf("list campaigns: %w", err)
	}

	rows := extractRows(decoded)
	result := ListCampaignsResult{Items: mapCampaigns(rows)}
	return &TypedResponse[ListCampaignsResult]{
		Raw:  rawResp.Body,
		Data: result,
		Meta: rawResp.Meta,
	}, nil
}

func (c *Client) GetDailyCampaignStatisticsJSON(
	ctx context.Context,
	_ string,
	bearerToken string,
	req CampaignStatisticsRequest,
) (*TypedResponse[CampaignStatisticsResult], error) {
	queryParams := map[string]string{}
	if len(req.CampaignIDs) > 0 {
		ids := ""
		for idx, id := range req.CampaignIDs {
			if idx > 0 {
				ids += ","
			}
			ids += strconv.FormatInt(id, 10)
		}
		queryParams["campaignIds"] = ids
	}
	if req.DateFrom != "" {
		queryParams["dateFrom"] = req.DateFrom
	}
	if req.DateTo != "" {
		queryParams["dateTo"] = req.DateTo
	}

	var decoded map[string]any
	rawResp, err := c.transport.doJSONWithFallbackPaths(
		ctx,
		bearerToken,
		http.MethodGet,
		[]string{"/api/client/statistics/daily/json"},
		queryParams,
		nil,
		&decoded,
	)
	if err != nil {
		return nil, fmt.Errorf("get campaign statistics: %w", err)
	}

	rows := extractRows(decoded)
	result := CampaignStatisticsResult{Items: mapCampaignStatistics(rows)}
	return &TypedResponse[CampaignStatisticsResult]{
		Raw:  rawResp.Body,
		Data: result,
		Meta: rawResp.Meta,
	}, nil
}

func (c *Client) GetCampaignProductsForSKU(
	ctx context.Context,
	_ string,
	bearerToken string,
	req CampaignProductsRequest,
) (*TypedResponse[CampaignProductsResult], error) {
	queryParams := map[string]string{}
	if req.Page > 0 {
		queryParams["page"] = strconv.FormatInt(req.Page, 10)
	}
	if req.PageSize > 0 {
		queryParams["pageSize"] = strconv.FormatInt(req.PageSize, 10)
	}

	var decoded map[string]any
	rawResp, err := c.transport.doJSONWithFallbackPaths(
		ctx,
		bearerToken,
		http.MethodGet,
		[]string{fmt.Sprintf("/api/client/campaign/%d/v2/products", req.CampaignID)},
		queryParams,
		nil,
		&decoded,
	)
	if err != nil {
		return nil, fmt.Errorf("get sku campaign products: %w", err)
	}

	rows := extractRows(decoded)
	result := CampaignProductsResult{Items: mapCampaignProducts(req.CampaignID, rows)}
	return &TypedResponse[CampaignProductsResult]{
		Raw:  rawResp.Body,
		Data: result,
		Meta: rawResp.Meta,
	}, nil
}

func (c *Client) GetSearchPromoCampaignProducts(
	ctx context.Context,
	_ string,
	bearerToken string,
	req SearchPromoProductsRequest,
) (*TypedResponse[CampaignProductsResult], error) {
	payload := map[string]any{}
	if req.Page > 0 {
		payload["page"] = req.Page
	}
	if req.PageSize > 0 {
		payload["pageSize"] = req.PageSize
	}

	var decoded map[string]any
	rawResp, err := c.transport.doJSONWithFallbackPaths(
		ctx,
		bearerToken,
		http.MethodPost,
		[]string{"/api/client/campaign/search_promo/v2/products"},
		nil,
		payload,
		&decoded,
	)
	if err != nil {
		return nil, fmt.Errorf("get search promo campaign products: %w", err)
	}

	rows := extractRows(decoded)
	result := CampaignProductsResult{Items: mapSearchPromoProducts(rows)}
	return &TypedResponse[CampaignProductsResult]{
		Raw:  rawResp.Body,
		Data: result,
		Meta: rawResp.Meta,
	}, nil
}

func (c *Client) GetCampaignObjects(
	ctx context.Context,
	_ string,
	bearerToken string,
	campaignID int64,
) (*TypedResponse[CampaignProductsResult], error) {
	var decoded map[string]any
	rawResp, err := c.transport.doJSONWithFallbackPaths(
		ctx,
		bearerToken,
		http.MethodGet,
		[]string{fmt.Sprintf("/api/client/campaign/%d/objects", campaignID)},
		nil,
		nil,
		&decoded,
	)
	if err != nil {
		return nil, fmt.Errorf("get campaign objects: %w", err)
	}
	rows := extractRows(decoded)
	result := CampaignProductsResult{Items: mapCampaignProducts(campaignID, rows)}
	return &TypedResponse[CampaignProductsResult]{
		Raw:  rawResp.Body,
		Data: result,
		Meta: rawResp.Meta,
	}, nil
}
