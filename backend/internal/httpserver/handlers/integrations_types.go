package handlers

type accountResponse struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type ozonConnectionResponse struct {
	ID              int64   `json:"id"`
	SellerAccountID int64   `json:"seller_account_id"`
	Status          string  `json:"status"`
	LastCheckAt     *string `json:"last_check_at"`
	LastCheckResult *string `json:"last_check_result"`
	LastError       *string `json:"last_error"`
	HasCredentials  bool    `json:"has_credentials"`
	ClientIDMasked  string  `json:"client_id_masked"`
}

type upsertOzonConnectionRequest struct {
	ClientID string `json:"client_id"`
	APIKey   string `json:"api_key"`
}
