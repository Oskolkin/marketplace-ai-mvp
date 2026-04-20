package stocksync

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/rawpayloads"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	queries     *dbgen.Queries
	ozonService *ozon.Service
	ozonClient  *ozon.Client
	rawPayloads *rawpayloads.Service
}

type RunInput struct {
	SellerAccountID int64
	ImportJobID     int64
	SourceCursor    string
}

type RunResult struct {
	RecordsReceived int32
	RecordsImported int32
	RecordsFailed   int32
	NextCursorValue string
}

func NewService(
	db *pgxpool.Pool,
	ozonService *ozon.Service,
	rawPayloads *rawpayloads.Service,
) *Service {
	return &Service{
		queries:     dbgen.New(db),
		ozonService: ozonService,
		ozonClient:  ozon.NewClient(),
		rawPayloads: rawPayloads,
	}
}

func (s *Service) Run(ctx context.Context, input RunInput) (RunResult, error) {
	creds, err := s.ozonService.GetDecryptedCredentials(ctx, input.SellerAccountID)
	if err != nil {
		return RunResult{}, fmt.Errorf("get decrypted ozon credentials: %w", err)
	}

	snapshotAt := time.Now().UTC().Truncate(time.Second)

	req := ozon.ListStocksRequest{}

	resp, err := s.ozonClient.ListStocks(ctx, creds.ClientID, creds.APIKey, req)
	if err != nil {
		return RunResult{}, fmt.Errorf("fetch stocks from ozon: %w", err)
	}

	if _, err := s.rawPayloads.Save(ctx, rawpayloads.SaveInput{
		SellerAccountID: input.SellerAccountID,
		ImportJobID:     input.ImportJobID,
		Domain:          "stocks",
		Source:          "ozon.v2.products.stocks",
		RequestKey:      buildStocksRequestKey(),
		Body:            resp.Raw,
	}); err != nil {
		return RunResult{}, fmt.Errorf("save raw stocks payload: %w", err)
	}

	received := int32(len(resp.Data.Result))
	imported := int32(0)

	for _, item := range resp.Data.Result {
		rawSubset, err := json.Marshal(item)
		if err != nil {
			return RunResult{}, fmt.Errorf("marshal stock raw subset: %w", err)
		}

		productExternalID := strconv.FormatInt(item.ProductID, 10)
		warehouseExternalID := strconv.FormatInt(item.WarehouseID, 10)

		available := item.Present - item.Reserved
		if available < 0 {
			available = 0
		}

		if _, err := s.queries.UpsertStock(ctx, dbgen.UpsertStockParams{
			SellerAccountID:     input.SellerAccountID,
			ProductExternalID:   productExternalID,
			WarehouseExternalID: warehouseExternalID,
			QuantityTotal:       nullableInt32(item.Present),
			QuantityReserved:    nullableInt32(item.Reserved),
			QuantityAvailable:   nullableInt32(available),
			SnapshotAt: pgtype.Timestamptz{
				Time:  snapshotAt,
				Valid: true,
			},
			RawAttributes: rawSubset,
		}); err != nil {
			return RunResult{}, fmt.Errorf(
				"upsert stock product_id=%d warehouse_id=%d: %w",
				item.ProductID,
				item.WarehouseID,
				err,
			)
		}

		imported++
	}

	return RunResult{
		RecordsReceived: received,
		RecordsImported: imported,
		RecordsFailed:   0,
		NextCursorValue: snapshotAt.Format(time.RFC3339),
	}, nil
}

func buildStocksRequestKey() string {
	return "stocks:current_snapshot"
}

func nullableInt32(v int32) pgtype.Int4 {
	return pgtype.Int4{
		Int32: v,
		Valid: true,
	}
}
