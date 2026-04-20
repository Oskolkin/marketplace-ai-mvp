package ozon

import (
	"context"
	"net/http"
)

type ListStocksRequest struct {
	OfferID   []string `json:"offer_id,omitempty"`
	ProductID []int64  `json:"product_id,omitempty"`
}

type StockItem struct {
	ProductID   int64  `json:"product_id"`
	OfferID     string `json:"offer_id"`
	WarehouseID int64  `json:"warehouse_id"`
	Present     int32  `json:"present"`
	Reserved    int32  `json:"reserved"`
}

type ListStocksResult struct {
	Result []StockItem `json:"result"`
}

func (c *Client) ListStocks(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListStocksRequest,
) (*TypedResponse[ListStocksResult], error) {
	var parsed ListStocksResult

	rawResp, err := c.doJSON(
		ctx,
		clientID,
		apiKey,
		http.MethodPost,
		"/v2/products/stocks",
		req,
		&parsed,
	)
	if err != nil {
		return nil, err
	}

	return &TypedResponse[ListStocksResult]{
		Raw:  rawResp.Body,
		Data: parsed,
		Meta: rawResp.Meta,
	}, nil
}
