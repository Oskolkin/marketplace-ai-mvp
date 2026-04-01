package ozon

import (
	"context"
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
	httpClient *http.Client
	baseURL    string
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		baseURL: "https://api-seller.ozon.ru",
	}
}

func (c *Client) CheckConnection(ctx context.Context, clientID, apiKey string) error {
	// Временный safe test-call.
	// Если endpoint окажется неудобным для health-check, его потом заменим в одном месте.
	body := `{"language":"DEFAULT"}`

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/v1/description-category/tree",
		strings.NewReader(body),
	)
	if err != nil {
		return fmt.Errorf("build ozon request: %w", err)
	}

	req.Header.Set("Client-Id", clientID)
	req.Header.Set("Api-Key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		var netErr net.Error
		if errors.As(err, &netErr) {
			return ErrNetworkError
		}
		return ErrNetworkError
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	bodyText := strings.TrimSpace(string(respBody))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return ErrInvalidCredentials
	case resp.StatusCode >= 500:
		return &ProviderError{
			StatusCode: resp.StatusCode,
			Body:       bodyText,
		}
	default:
		return &ProviderError{
			StatusCode: resp.StatusCode,
			Body:       bodyText,
		}
	}
}
