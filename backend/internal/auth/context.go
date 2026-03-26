package auth

import (
	"context"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
)

type contextKey string

const (
	UserContextKey          contextKey = "auth_user"
	SellerAccountContextKey contextKey = "auth_seller_account"
)

func WithAuthContext(ctx context.Context, user dbgen.User, sellerAccount dbgen.SellerAccount) context.Context {
	ctx = context.WithValue(ctx, UserContextKey, user)
	ctx = context.WithValue(ctx, SellerAccountContextKey, sellerAccount)
	return ctx
}

func UserFromContext(ctx context.Context) (dbgen.User, bool) {
	v := ctx.Value(UserContextKey)
	user, ok := v.(dbgen.User)
	return user, ok
}

func SellerAccountFromContext(ctx context.Context) (dbgen.SellerAccount, bool) {
	v := ctx.Value(SellerAccountContextKey)
	sellerAccount, ok := v.(dbgen.SellerAccount)
	return sellerAccount, ok
}
