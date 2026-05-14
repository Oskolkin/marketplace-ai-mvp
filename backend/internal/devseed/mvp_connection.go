package devseed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	mvpDemoOzonClientID          = "DEMO_CLIENT_ID"
	mvpDemoOzonAPIKey            = "DEMO_API_KEY"
	mvpDemoOzonPerformanceToken  = "DEMO_PERFORMANCE_TOKEN"
)

// SeedOzonConnectionMock upserts Seller API + Performance API credentials using the same SecretCodec as production.
func SeedOzonConnectionMock(ctx context.Context, q *dbgen.Queries, sellerAccountID int64, anchorUTC time.Time, encryptionKey string) error {
	if len(encryptionKey) != 32 {
		return fmt.Errorf("encryption key must be 32 bytes")
	}
	codec, err := ozon.NewSecretCodec(encryptionKey)
	if err != nil {
		return fmt.Errorf("secret codec: %w", err)
	}

	clientEnc, err := codec.Encrypt(mvpDemoOzonClientID)
	if err != nil {
		return fmt.Errorf("encrypt client id: %w", err)
	}
	apiEnc, err := codec.Encrypt(mvpDemoOzonAPIKey)
	if err != nil {
		return fmt.Errorf("encrypt api key: %w", err)
	}
	pfmEnc, err := codec.Encrypt(mvpDemoOzonPerformanceToken)
	if err != nil {
		return fmt.Errorf("encrypt performance token: %w", err)
	}

	checkAt := pgtype.Timestamptz{Time: anchorUTC.Add(-30 * time.Minute).UTC(), Valid: true}
	sellerCheck, _ := json.Marshal(map[string]any{
		"seller_name":  "MVP Demo Seller (dev-seed-mvp)",
		"roles":        []string{"seller", "analytics"},
		"permissions":  []string{"products", "postings", "analytics"},
		"seeded_by":    "dev-seed-mvp",
		"company_type": "SHOP",
	})
	okResult := pgtype.Text{String: string(sellerCheck), Valid: true}

	_, err = q.GetOzonConnectionBySellerAccountID(ctx, sellerAccountID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("get ozon connection: %w", err)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		_, err = q.CreateOzonConnection(ctx, dbgen.CreateOzonConnectionParams{
			SellerAccountID:   sellerAccountID,
			ClientIDEncrypted: clientEnc,
			ApiKeyEncrypted:   apiEnc,
			Status:            "valid",
			LastCheckAt:       checkAt,
			LastCheckResult:   okResult,
			LastError:         pgtype.Text{},
		})
		if err != nil {
			return fmt.Errorf("create ozon connection: %w", err)
		}
	} else {
		_, err = q.UpdateOzonConnectionCredentials(ctx, dbgen.UpdateOzonConnectionCredentialsParams{
			SellerAccountID:   sellerAccountID,
			ClientIDEncrypted: clientEnc,
			ApiKeyEncrypted:   apiEnc,
			Status:            "valid",
			LastCheckAt:       checkAt,
			LastCheckResult:   okResult,
			LastError:         pgtype.Text{},
		})
		if err != nil {
			return fmt.Errorf("update ozon connection credentials: %w", err)
		}
	}

	if _, err := q.UpdateOzonPerformanceBearerToken(ctx, dbgen.UpdateOzonPerformanceBearerTokenParams{
		SellerAccountID:           sellerAccountID,
		PerformanceTokenEncrypted: pgtype.Text{String: pfmEnc, Valid: true},
	}); err != nil {
		return fmt.Errorf("set performance token: %w", err)
	}

	pfmCheck := anchorUTC.Add(-15 * time.Minute).UTC()
	pfmJSON, _ := json.Marshal(map[string]any{
		"seeded_by":       "dev-seed-mvp",
		"performance_api": "ok",
		"campaigns_probe": "skipped_in_seed",
	})
	if _, err := q.UpdateOzonPerformanceCheckResult(ctx, dbgen.UpdateOzonPerformanceCheckResultParams{
		SellerAccountID:            sellerAccountID,
		PerformanceStatus:          "valid",
		PerformanceLastCheckAt:     pgtype.Timestamptz{Time: pfmCheck, Valid: true},
		PerformanceLastCheckResult: pgtype.Text{String: string(pfmJSON), Valid: true},
		PerformanceLastError:       pgtype.Text{},
	}); err != nil {
		return fmt.Errorf("update performance check: %w", err)
	}

	return nil
}
