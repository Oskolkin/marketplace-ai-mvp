package auth

import "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"

type RegisterInput struct {
	Email           string
	Password        string
	PasswordConfirm string
}

type LoginInput struct {
	Email    string
	Password string
}

type AuthResult struct {
	User          dbgen.User
	SellerAccount dbgen.SellerAccount
	SessionToken  string
}
