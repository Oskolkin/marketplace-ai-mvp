package ozon

import (
	"context"
	"errors"
	"fmt"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrConnectionNotFound = errors.New("ozon connection not found")

type Service struct {
	queries     *dbgen.Queries
	secretCodec *SecretCodec
}

func NewService(db *pgxpool.Pool, encryptionKey string) (*Service, error) {
	codec, err := NewSecretCodec(encryptionKey)
	if err != nil {
		return nil, err
	}

	return &Service{
		queries:     dbgen.New(db),
		secretCodec: codec,
	}, nil
}

type UpsertConnectionInput struct {
	SellerAccountID int64
	ClientID        string
	APIKey          string
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

func (s *Service) MaskedClientID(connection dbgen.OzonConnection) string {
	decrypted, err := s.secretCodec.Decrypt(connection.ClientIDEncrypted)
	if err != nil {
		return ""
	}

	return MaskClientID(decrypted)
}
