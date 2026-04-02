package handlers

import (
	"errors"
	"net/http"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
)

type OzonSyncHandler struct {
	syncService *ozon.SyncService
}

func NewOzonSyncHandler(syncService *ozon.SyncService) *OzonSyncHandler {
	return &OzonSyncHandler{
		syncService: syncService,
	}
}

func (h *OzonSyncHandler) StartInitialSync(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	job, err := h.syncService.StartInitialSync(r.Context(), sellerAccount.ID)
	if err != nil {
		switch {
		case errors.Is(err, ozon.ErrConnectionNotFound):
			writeJSONError(w, http.StatusNotFound, "ozon connection not found")
		case errors.Is(err, ozon.ErrConnectionNotValid):
			writeJSONError(w, http.StatusBadRequest, "ozon connection is not valid")
		case errors.Is(err, ozon.ErrInitialSyncAlreadyBusy):
			writeJSONError(w, http.StatusConflict, "initial sync is already running")
		default:
			writeJSONError(w, http.StatusInternalServerError, "failed to start initial sync")
		}
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"sync_job": map[string]any{
			"id":     job.ID,
			"type":   job.Type,
			"status": job.Status,
		},
	})
}

func (h *OzonSyncHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	status, err := h.syncService.GetStatus(r.Context(), sellerAccount.ID)
	if err != nil {
		if errors.Is(err, ozon.ErrConnectionNotFound) {
			writeJSONError(w, http.StatusNotFound, "ozon connection not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to get ozon sync status")
		return
	}

	writeJSON(w, http.StatusOK, status)
}
