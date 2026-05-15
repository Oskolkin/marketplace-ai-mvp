package auth

import (
	"net/http"
	"strings"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
)

func Middleware(service *Service, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(cookieName)
			if err != nil || cookie.Value == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
				return
			}

			result, err := service.GetCurrentUser(r.Context(), cookie.Value)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
				return
			}

			ctx := WithAuthContext(r.Context(), result.User, result.SellerAccount)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireSellerAccount() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if _, ok := SellerAccountFromContext(r.Context()); !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`{"error":"seller account required"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func IsAdminUser(user *dbgen.User, adminEmails []string) bool {
	if user == nil || user.Email == "" || len(adminEmails) == 0 {
		return false
	}

	email := strings.ToLower(strings.TrimSpace(user.Email))
	if email == "" {
		return false
	}

	for _, adminEmail := range adminEmails {
		if strings.EqualFold(strings.TrimSpace(adminEmail), email) {
			return true
		}
	}

	return false
}

func AdminMiddleware(adminEmails []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok || !IsAdminUser(&user, adminEmails) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`{"error":"admin access required"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
