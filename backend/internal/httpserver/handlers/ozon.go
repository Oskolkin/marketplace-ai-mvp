package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
)

type OzonHandler struct {
	ozonService *ozon.Service
}

func NewOzonHandler(ozonService *ozon.Service) *OzonHandler {
	return &OzonHandler{
		ozonService: ozonService,
	}
}

func (h *OzonHandler) GetConnection(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	connection, err := h.ozonService.GetBySellerAccountID(r.Context(), sellerAccount.ID)
	if err != nil {
		if err == ozon.ErrConnectionNotFound {
			writeJSON(w, http.StatusOK, map[string]any{
				"connection": nil,
			})
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to get ozon connection")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"connection": buildOzonConnectionResponse(connection, h.ozonService),
	})
}

func (h *OzonHandler) CreateConnection(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req upsertOzonConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ClientID == "" || req.APIKey == "" {
		writeJSONError(w, http.StatusBadRequest, "client_id and api_key are required")
		return
	}

	connection, err := h.ozonService.Create(r.Context(), ozon.UpsertConnectionInput{
		SellerAccountID: sellerAccount.ID,
		ClientID:        req.ClientID,
		APIKey:          req.APIKey,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create ozon connection")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"connection": buildOzonConnectionResponse(connection, h.ozonService),
	})
}

func (h *OzonHandler) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req upsertOzonConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ClientID == "" || req.APIKey == "" {
		writeJSONError(w, http.StatusBadRequest, "client_id and api_key are required")
		return
	}

	connection, err := h.ozonService.Update(r.Context(), ozon.UpsertConnectionInput{
		SellerAccountID: sellerAccount.ID,
		ClientID:        req.ClientID,
		APIKey:          req.APIKey,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update ozon connection")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"connection": buildOzonConnectionResponse(connection, h.ozonService),
	})
}

func buildOzonConnectionResponse(connection dbgen.OzonConnection, service *ozon.Service) ozonConnectionResponse {
	var lastCheckAt *string
	if connection.LastCheckAt.Valid {
		value := connection.LastCheckAt.Time.Format(time.RFC3339)
		lastCheckAt = &value
	}

	var lastCheckResult *string
	if connection.LastCheckResult.Valid {
		value := connection.LastCheckResult.String
		lastCheckResult = &value
	}

	var lastError *string
	if connection.LastError.Valid {
		value := connection.LastError.String
		lastError = &value
	}

	return ozonConnectionResponse{
		ID:              connection.ID,
		SellerAccountID: connection.SellerAccountID,
		Status:          connection.Status,
		LastCheckAt:     lastCheckAt,
		LastCheckResult: lastCheckResult,
		LastError:       lastError,
		HasCredentials:  true,
		ClientIDMasked:  service.MaskedClientID(connection),
	}
}
