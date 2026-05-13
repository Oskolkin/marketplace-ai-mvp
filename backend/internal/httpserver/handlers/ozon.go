package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
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
		SellerAccountID:        sellerAccount.ID,
		ClientID:               req.ClientID,
		APIKey:                 req.APIKey,
		PerformanceBearerToken: req.PerformanceBearerToken,
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

func (h *OzonHandler) PutPerformanceToken(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		PerformanceBearerToken *string `json:"performance_bearer_token,omitempty"`
		ClearPerformanceToken  bool    `json:"clear_performance_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var (
		connection dbgen.OzonConnection
		err        error
	)
	switch {
	case req.ClearPerformanceToken:
		connection, err = h.ozonService.ClearPerformanceBearerToken(r.Context(), sellerAccount.ID)
	case req.PerformanceBearerToken != nil && strings.TrimSpace(*req.PerformanceBearerToken) != "":
		connection, err = h.ozonService.SetPerformanceBearerToken(
			r.Context(),
			sellerAccount.ID,
			strings.TrimSpace(*req.PerformanceBearerToken),
		)
	default:
		connection, err = h.ozonService.GetBySellerAccountID(r.Context(), sellerAccount.ID)
	}
	if err != nil {
		if err == ozon.ErrConnectionNotFound {
			writeJSONError(w, http.StatusNotFound, "ozon connection not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to update performance token")
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

	var perfLastCheckAt *string
	if connection.PerformanceLastCheckAt.Valid {
		v := connection.PerformanceLastCheckAt.Time.Format(time.RFC3339)
		perfLastCheckAt = &v
	}
	var perfLastCheckResult *string
	if connection.PerformanceLastCheckResult.Valid {
		v := connection.PerformanceLastCheckResult.String
		perfLastCheckResult = &v
	}
	var perfLastError *string
	if connection.PerformanceLastError.Valid {
		v := connection.PerformanceLastError.String
		perfLastError = &v
	}

	perfTokenSet := connection.PerformanceTokenEncrypted.Valid &&
		strings.TrimSpace(connection.PerformanceTokenEncrypted.String) != ""

	return ozonConnectionResponse{
		ID:              connection.ID,
		SellerAccountID: connection.SellerAccountID,
		Status:          connection.Status,
		LastCheckAt:     lastCheckAt,
		LastCheckResult: lastCheckResult,
		LastError:       lastError,
		HasCredentials:  true,
		ClientIDMasked:  service.MaskedClientID(connection),

		PerformanceTokenSet:        perfTokenSet,
		PerformanceStatus:          connection.PerformanceStatus,
		PerformanceLastCheckAt:     perfLastCheckAt,
		PerformanceLastCheckResult: perfLastCheckResult,
		PerformanceLastError:       perfLastError,
	}
}

func (h *OzonHandler) CheckConnection(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	result, err := h.ozonService.CheckConnection(r.Context(), sellerAccount.ID)
	if err != nil {
		if err == ozon.ErrConnectionNotFound {
			writeJSONError(w, http.StatusNotFound, "ozon connection not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to check ozon connection")
		return
	}

	writeJSON(w, http.StatusOK, ozonCheckResponse{
		Status:    result.Status,
		CheckedAt: result.CheckedAt.Format(time.RFC3339),
		Message:   result.Message,
		ErrorCode: result.ErrorCode,
	})
}

func (h *OzonHandler) CheckPerformanceConnection(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	result, err := h.ozonService.CheckPerformanceConnection(r.Context(), sellerAccount.ID)
	if err != nil {
		if err == ozon.ErrConnectionNotFound {
			writeJSONError(w, http.StatusNotFound, "ozon connection not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to check ozon performance connection")
		return
	}

	writeJSON(w, http.StatusOK, ozonCheckResponse{
		Status:    result.Status,
		CheckedAt: result.CheckedAt.Format(time.RFC3339),
		Message:   result.Message,
		ErrorCode: result.ErrorCode,
	})
}
