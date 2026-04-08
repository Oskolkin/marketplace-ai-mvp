package ozon

import (
	"context"
	"net/http"
)

type ListOrdersRequest struct {
	Since  string `json:"since,omitempty"`
	To     string `json:"to,omitempty"`
	Limit  int    `json:"limit,omitempty"`
	Offset int    `json:"offset,omitempty"`
}

type OrderItem struct {
	OrderID       string `json:"order_id"`
	PostingNumber string `json:"posting_number"`
	Status        string `json:"status"`
	CreatedAt     string `json:"created_at"`
}

type ListOrdersResult struct {
	Result []OrderItem `json:"result"`
}

func (c *Client) ListOrders(
	ctx context.Context,
	clientID string,
	apiKey string,
	req ListOrdersRequest,
) (*TypedResponse[ListOrdersResult], error) {
	var parsed ListOrdersResult

	rawResp, err := c.doJSON(
		ctx,
		clientID,
		apiKey,
		http.MethodPost,
		"/v3/posting/fbs/list",
		req,
		&parsed,
	)
	if err != nil {
		return nil, err
	}

	return &TypedResponse[ListOrdersResult]{
		Raw:  rawResp.Body,
		Data: parsed,
		Meta: rawResp.Meta,
	}, nil
}
