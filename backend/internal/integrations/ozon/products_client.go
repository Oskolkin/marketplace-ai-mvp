package ozon

import (
	"context"
	"net/http"
)

type ListProductsRequest struct {
	OfferID   []string `json:"offer_id,omitempty"`
	ProductID []int64  `json:"product_id,omitempty"`
	Limit     int      `json:"limit,omitempty"`
	LastID    string   `json:"last_id,omitempty"`
}

type ProductItem struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	OfferID    string `json:"offer_id"`
	SKU        int64  `json:"sku"`
	Status     string `json:"status"`
	State      string `json:"state"`
	IsArchived bool   `json:"is_archived"`
	Archived   bool   `json:"archived"`
	UpdatedAt  string `json:"updated_at"`
}

type ListProductsResult struct {
	Items  []ProductItem `json:"items"`
	LastID string        `json:"last_id"`
	Total  int64         `json:"total"`
}

type listProductsEnvelope struct {
	Result ListProductsResult `json:"result"`
}

type ProductInfoListRequest struct {
	OfferID   []string `json:"offer_id,omitempty"`
	ProductID []int64  `json:"product_id,omitempty"`
	SKU       []int64  `json:"sku,omitempty"`
}

type ProductInfoListItem struct {
	ID                    int64  `json:"id"`
	OfferID               string `json:"offer_id"`
	SKU                   int64  `json:"sku"`
	Name                  string `json:"name"`
	Price                 string `json:"price"`
	OldPrice              string `json:"old_price"`
	MinPrice              string `json:"min_price"`
	DescriptionCategoryID int64  `json:"description_category_id"`
	Status                struct {
		State string `json:"state"`
	} `json:"statuses"`
	UpdatedAt  string `json:"updated_at"`
	IsArchived bool   `json:"is_archived"`
	Archived   bool   `json:"archived"`
}

type ProductInfoListResult struct {
	Items []ProductInfoListItem `json:"items"`
}

func (c *Client) ListProducts(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListProductsRequest,
) (*TypedResponse[ListProductsResult], error) {
	var parsed listProductsEnvelope

	rawResp, err := c.doJSON(
		ctx,
		clientID,
		apiKey,
		http.MethodPost,
		"/v3/product/list",
		req,
		&parsed,
	)
	if err != nil {
		return nil, err
	}

	return &TypedResponse[ListProductsResult]{
		Raw:  rawResp.Body,
		Data: parsed.Result,
		Meta: rawResp.Meta,
	}, nil
}

func (c *Client) ListProductsInfo(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ProductInfoListRequest,
) (*TypedResponse[ProductInfoListResult], error) {
	var parsed ProductInfoListResult
	rawResp, err := c.doJSON(
		ctx,
		clientID,
		apiKey,
		http.MethodPost,
		"/v3/product/info/list",
		req,
		&parsed,
	)
	if err != nil {
		return nil, err
	}
	return &TypedResponse[ProductInfoListResult]{
		Raw:  rawResp.Body,
		Data: parsed,
		Meta: rawResp.Meta,
	}, nil
}
