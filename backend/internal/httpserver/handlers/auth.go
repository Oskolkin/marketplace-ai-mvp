package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
)

type AuthHandler struct {
	authService *auth.Service
	cookieName  string
	adminEmails []string
}

func NewAuthHandler(authService *auth.Service, cookieName string, adminEmails []string) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		cookieName:  cookieName,
		adminEmails: adminEmails,
	}
}

type registerRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	PasswordConfirm string `json:"password_confirm"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type sellerAccountResponse struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type authResponse struct {
	User struct {
		ID     int64  `json:"id"`
		Email  string `json:"email"`
		Status string `json:"status"`
	} `json:"user"`
	SellerAccount *sellerAccountResponse `json:"seller_account"`
	IsAdmin       bool                   `json:"is_admin"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	result, err := h.authService.Register(r.Context(), auth.RegisterInput{
		Email:           req.Email,
		Password:        req.Password,
		PasswordConfirm: req.PasswordConfirm,
	})
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrEmailAlreadyExists):
			writeJSONError(w, http.StatusConflict, "email already exists")
		default:
			writeJSONError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	setAuthCookie(w, h.cookieName, result.SessionToken)

	writeJSON(w, http.StatusCreated, buildAuthResponse(result, h.adminEmails))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	result, err := h.authService.Login(r.Context(), auth.LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrInvalidCredentials):
			writeJSONError(w, http.StatusUnauthorized, "invalid credentials")
		case errors.Is(err, auth.ErrUnauthorized):
			writeJSONError(w, http.StatusForbidden, "user is not active")
		case errors.Is(err, auth.ErrSellerAccountRequired):
			writeJSONError(w, http.StatusForbidden, "seller account required")
		default:
			writeJSONError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	setAuthCookie(w, h.cookieName, result.SessionToken)

	writeJSON(w, http.StatusOK, buildAuthResponse(result, h.adminEmails))
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	result := &auth.AuthResult{User: user}
	if sellerAccount, ok := auth.SellerAccountFromContext(r.Context()); ok {
		result.SellerAccount = &sellerAccount
	}

	writeJSON(w, http.StatusOK, buildAuthResponse(result, h.adminEmails))
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil || cookie.Value == "" {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if err := h.authService.Logout(r.Context(), cookie.Value); err != nil {
		if errors.Is(err, auth.ErrUnauthorized) {
			writeJSONError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to logout")
		return
	}

	clearAuthCookie(w, h.cookieName)

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "logged_out",
	})
}

func buildAuthResponse(result *auth.AuthResult, adminEmails []string) authResponse {
	resp := authResponse{
		IsAdmin: auth.IsAdminUser(&result.User, adminEmails),
	}
	resp.User.ID = result.User.ID
	resp.User.Email = result.User.Email
	resp.User.Status = result.User.Status

	if result.SellerAccount != nil {
		resp.SellerAccount = &sellerAccountResponse{
			ID:     result.SellerAccount.ID,
			Name:   result.SellerAccount.Name,
			Status: result.SellerAccount.Status,
		}
	}

	return resp
}

func setAuthCookie(w http.ResponseWriter, cookieName, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
	})
}

func clearAuthCookie(w http.ResponseWriter, cookieName string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		MaxAge:   -1,
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}
