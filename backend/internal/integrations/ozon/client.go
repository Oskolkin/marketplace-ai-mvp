package ozon

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrNetworkError       = errors.New("network error")
	ErrProviderError      = errors.New("provider error")
)

type ProviderError struct {
	StatusCode int
	Body       string
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("provider error: status=%d body=%s", e.StatusCode, e.Body)
}

type Client struct {
	httpClient  *http.Client
	baseURL     string
	retryConfig RetryConfig
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		baseURL:     "https://api-seller.ozon.ru",
		retryConfig: DefaultRetryConfig(),
	}
}

func NewClientWithConfig(httpClient *http.Client, baseURL string, retryConfig RetryConfig) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	if baseURL == "" {
		baseURL = "https://api-seller.ozon.ru"
	}

	return &Client{
		httpClient:  httpClient,
		baseURL:     baseURL,
		retryConfig: retryConfig,
	}
}

func (c *Client) doRequestOnce(
	ctx context.Context,
	clientID string,
	apiKey string,
	method string,
	path string,
	body []byte,
) (*RawResponse, error) {
	url := c.baseURL + path

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, fmt.Errorf("build ozon request: %w", err)
	}

	req.Header.Set("Client-Id", clientID)
	req.Header.Set("Api-Key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		var netErr net.Error
		if errors.As(err, &netErr) {
			return nil, ErrNetworkError
		}
		return nil, ErrNetworkError
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read ozon response body: %w", err)
	}

	meta := ResponseMeta{
		StatusCode: resp.StatusCode,
		RequestID:  resp.Header.Get("X-Request-Id"),
	}

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return &RawResponse{
			Body: respBody,
			Meta: meta,
		}, nil

	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return nil, ErrInvalidCredentials

	default:
		bodyText := strings.TrimSpace(string(respBody))
		return nil, &ProviderError{
			StatusCode: resp.StatusCode,
			Body:       bodyText,
		}
	}
}

func (c *Client) doRequest(
	ctx context.Context,
	clientID string,
	apiKey string,
	method string,
	path string,
	body []byte,
) (*RawResponse, error) {
	return withRetry[*RawResponse](ctx, c.retryConfig, func() (*RawResponse, error) {
		return c.doRequestOnce(ctx, clientID, apiKey, method, path, body)
	})
}

func (c *Client) doJSON(
	ctx context.Context,
	clientID string,
	apiKey string,
	method string,
	path string,
	request any,
	responseDest any,
) (*RawResponse, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshal ozon request: %w", err)
	}

	rawResp, err := c.doRequest(ctx, clientID, apiKey, method, path, body)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(rawResp.Body, responseDest); err != nil {
		return nil, fmt.Errorf("unmarshal ozon response: %w", err)
	}

	return rawResp, nil
}

func (c *Client) CheckConnection(ctx context.Context, clientID, apiKey string) error {
	type request struct {
		Language string `json:"language"`
	}
	type response struct{}

	var resp response

	_, err := c.doJSON(
		ctx,
		clientID,
		apiKey,
		http.MethodPost,
		"/v1/description-category/tree",
		request{
			Language: "DEFAULT",
		},
		&resp,
	)

	return err
}
