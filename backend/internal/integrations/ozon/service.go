package ozon

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrConnectionNotFound = errors.New("ozon connection not found")

type Service struct {
	queries     *dbgen.Queries
	secretCodec *SecretCodec
	client      *Client
}

func NewService(db *pgxpool.Pool, encryptionKey string) (*Service, error) {
	codec, err := NewSecretCodec(encryptionKey)
	if err != nil {
		return nil, err
	}

	return &Service{
		queries:     dbgen.New(db),
		secretCodec: codec,
		client:      NewClient(),
	}, nil
}

type UpsertConnectionInput struct {
	SellerAccountID int64
	ClientID        string
	APIKey          string
}

type CheckConnectionResult struct {
	Status    string
	CheckedAt time.Time
	Message   string
	ErrorCode *string
}

func (s *Service) GetBySellerAccountID(ctx context.Context, sellerAccountID int64) (dbgen.OzonConnection, error) {
	connection, err := s.queries.GetOzonConnectionBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbgen.OzonConnection{}, ErrConnectionNotFound
		}
		return dbgen.OzonConnection{}, fmt.Errorf("get ozon connection: %w", err)
	}

	return connection, nil
}

func (s *Service) Create(ctx context.Context, input UpsertConnectionInput) (dbgen.OzonConnection, error) {
	clientIDEncrypted, err := s.secretCodec.Encrypt(input.ClientID)
	if err != nil {
		return dbgen.OzonConnection{}, fmt.Errorf("encrypt client id: %w", err)
	}

	apiKeyEncrypted, err := s.secretCodec.Encrypt(input.APIKey)
	if err != nil {
		return dbgen.OzonConnection{}, fmt.Errorf("encrypt api key: %w", err)
	}

	connection, err := s.queries.CreateOzonConnection(ctx, dbgen.CreateOzonConnectionParams{
		SellerAccountID:   input.SellerAccountID,
		ClientIDEncrypted: clientIDEncrypted,
		ApiKeyEncrypted:   apiKeyEncrypted,
		Status:            "draft",
		LastCheckAt:       pgtypeTimestamptzNull(),
		LastCheckResult:   pgtypeTextNull(),
		LastError:         pgtypeTextNull(),
	})
	if err != nil {
		return dbgen.OzonConnection{}, fmt.Errorf("create ozon connection: %w", err)
	}

	return connection, nil
}

func (s *Service) Update(ctx context.Context, input UpsertConnectionInput) (dbgen.OzonConnection, error) {
	clientIDEncrypted, err := s.secretCodec.Encrypt(input.ClientID)
	if err != nil {
		return dbgen.OzonConnection{}, fmt.Errorf("encrypt client id: %w", err)
	}

	apiKeyEncrypted, err := s.secretCodec.Encrypt(input.APIKey)
	if err != nil {
		return dbgen.OzonConnection{}, fmt.Errorf("encrypt api key: %w", err)
	}

	connection, err := s.queries.UpdateOzonConnectionCredentials(ctx, dbgen.UpdateOzonConnectionCredentialsParams{
		SellerAccountID:   input.SellerAccountID,
		ClientIDEncrypted: clientIDEncrypted,
		ApiKeyEncrypted:   apiKeyEncrypted,
		Status:            "draft",
		LastCheckAt:       pgtypeTimestamptzNull(),
		LastCheckResult:   pgtypeTextNull(),
		LastError:         pgtypeTextNull(),
	})
	if err != nil {
		return dbgen.OzonConnection{}, fmt.Errorf("update ozon connection: %w", err)
	}

	return connection, nil
}

func (s *Service) CheckConnection(ctx context.Context, sellerAccountID int64) (CheckConnectionResult, error) {
	connection, err := s.GetBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		return CheckConnectionResult{}, err
	}

	clientID, err := s.secretCodec.Decrypt(connection.ClientIDEncrypted)
	if err != nil {
		return CheckConnectionResult{}, fmt.Errorf("decrypt client id: %w", err)
	}

	apiKey, err := s.secretCodec.Decrypt(connection.ApiKeyEncrypted)
	if err != nil {
		return CheckConnectionResult{}, fmt.Errorf("decrypt api key: %w", err)
	}

	checkedAt := time.Now()

	var (
		status          string
		lastCheckResult string
		lastError       string
		message         string
		errorCode       *string
	)

	err = s.client.CheckConnection(ctx, clientID, apiKey)
	switch {
	case err == nil:
		status = "valid"
		lastCheckResult = "valid"
		lastError = ""
		message = "connection is valid"

	case errors.Is(err, ErrInvalidCredentials):
		status = "invalid"
		lastCheckResult = "invalid_credentials"
		lastError = "invalid credentials"
		message = "invalid credentials"
		code := "invalid_credentials"
		errorCode = &code

	case errors.Is(err, ErrNetworkError):
		status = "invalid"
		lastCheckResult = "network_error"
		lastError = "network error"
		message = "network error"
		code := "network_error"
		errorCode = &code

	default:
		status = "invalid"
		lastCheckResult = "provider_error"
		lastError = err.Error()
		message = "provider error"
		code := "provider_error"
		errorCode = &code
	}

	_, updateErr := s.queries.UpdateOzonConnectionCheckResult(ctx, dbgen.UpdateOzonConnectionCheckResultParams{
		SellerAccountID: sellerAccountID,
		Status:          status,
		LastCheckAt: pgtype.Timestamptz{
			Time:  checkedAt,
			Valid: true,
		},
		LastCheckResult: pgtype.Text{
			String: lastCheckResult,
			Valid:  true,
		},
		LastError: pgtype.Text{
			String: lastError,
			Valid:  lastError != "",
		},
	})
	if updateErr != nil {
		return CheckConnectionResult{}, fmt.Errorf("update ozon connection check result: %w", updateErr)
	}

	return CheckConnectionResult{
		Status:    status,
		CheckedAt: checkedAt,
		Message:   message,
		ErrorCode: errorCode,
	}, nil
}

func (s *Service) MaskedClientID(connection dbgen.OzonConnection) string {
	decrypted, err := s.secretCodec.Decrypt(connection.ClientIDEncrypted)
	if err != nil {
		return ""
	}

	return MaskClientID(decrypted)
}
