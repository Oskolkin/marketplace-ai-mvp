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
}

func (c *Client) ListProducts(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListProductsRequest,
) (*TypedResponse[ListProductsResult], error) {
	var parsed ListProductsResult

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
		Data: parsed,
		Meta: rawResp.Meta,
	}, nil
}
