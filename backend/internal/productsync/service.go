package productsync

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/rawpayloads"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	queries         *dbgen.Queries
	ozonService     *ozon.Service
	ozonClient      *ozon.Client
	rawPayloads     *rawpayloads.Service
	defaultPageSize int
}

func NewService(
	db *pgxpool.Pool,
	ozonService *ozon.Service,
	rawPayloads *rawpayloads.Service,
) *Service {
	return &Service{
		queries:         dbgen.New(db),
		ozonService:     ozonService,
		ozonClient:      ozon.NewClient(),
		rawPayloads:     rawPayloads,
		defaultPageSize: 1000,
	}
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

func (s *Service) Run(ctx context.Context, input RunInput) (RunResult, error) {
	creds, err := s.ozonService.GetDecryptedCredentials(ctx, input.SellerAccountID)
	if err != nil {
		return RunResult{}, fmt.Errorf("get decrypted ozon credentials: %w", err)
	}

	req := ozon.ListProductsRequest{
		Limit: s.defaultPageSize,
	}
	if input.SourceCursor != "" {
		req.LastID = input.SourceCursor
	}

	resp, err := s.ozonClient.ListProducts(ctx, creds.ClientID, creds.APIKey, req)
	if err != nil {
		return RunResult{}, fmt.Errorf("fetch products from ozon: %w", err)
	}

	productIDs := make([]int64, 0, len(resp.Data.Items))
	for _, item := range resp.Data.Items {
		if item.ID > 0 {
			productIDs = append(productIDs, item.ID)
		}
	}
	detailsByID := make(map[int64]ozon.ProductInfoListItem, len(productIDs))
	if len(productIDs) > 0 {
		detailsResp, err := s.ozonClient.ListProductsInfo(ctx, creds.ClientID, creds.APIKey, ozon.ProductInfoListRequest{
			ProductID: productIDs,
		})
		if err != nil {
			return RunResult{}, fmt.Errorf("fetch products details from ozon: %w", err)
		}
		for _, detail := range detailsResp.Data.Items {
			detailsByID[detail.ID] = detail
		}
	}

	requestKey := buildRequestKey(req)

	if _, err := s.rawPayloads.Save(ctx, rawpayloads.SaveInput{
		SellerAccountID: input.SellerAccountID,
		ImportJobID:     input.ImportJobID,
		Domain:          "products",
		Source:          "ozon.v3.product.list",
		RequestKey:      requestKey,
		Body:            resp.Raw,
	}); err != nil {
		return RunResult{}, fmt.Errorf("save raw products payload: %w", err)
	}

	received := int32(len(resp.Data.Items))
	imported := int32(0)

	for _, item := range resp.Data.Items {
		detail := detailsByID[item.ID]
		name := item.Name
		if detail.Name != "" {
			name = detail.Name
		}
		offerID := item.OfferID
		if detail.OfferID != "" {
			offerID = detail.OfferID
		}
		sku := item.SKU
		if detail.SKU != 0 {
			sku = detail.SKU
		}
		rawSubset, err := json.Marshal(item)
		if err != nil {
			return RunResult{}, fmt.Errorf("marshal product raw subset: %w", err)
		}

		updatedAtRaw := item.UpdatedAt
		if detail.UpdatedAt != "" {
			updatedAtRaw = detail.UpdatedAt
		}
		sourceUpdatedAt, err := parseOptionalRFC3339(updatedAtRaw)
		if err != nil {
			return RunResult{}, fmt.Errorf("parse product updated_at: %w", err)
		}

		if _, err := s.queries.UpsertProduct(ctx, dbgen.UpsertProductParams{
			SellerAccountID:       input.SellerAccountID,
			OzonProductID:         item.ID,
			OfferID:               nullableText(offerID),
			Sku:                   nullableInt64(sku),
			Name:                  fallbackName(name),
			Status:                nullableText(resolveStatus(item)),
			ReferencePrice:        nullableNumeric(detail.Price),
			OldPrice:              nullableNumeric(detail.OldPrice),
			OzonMinPrice:          nullableNumeric(detail.MinPrice),
			DescriptionCategoryID: nullableInt64(detail.DescriptionCategoryID),
			IsArchived:            item.IsArchived || item.Archived || detail.IsArchived || detail.Archived,
			RawAttributes:         rawSubset,
			SourceUpdatedAt:       sourceUpdatedAt,
		}); err != nil {
			return RunResult{}, fmt.Errorf("upsert product ozon_product_id=%d: %w", item.ID, err)
		}

		imported++
	}

	return RunResult{
		RecordsReceived: received,
		RecordsImported: imported,
		RecordsFailed:   0,
		NextCursorValue: resp.Data.LastID,
	}, nil
}

func buildRequestKey(req ozon.ListProductsRequest) string {
	if req.LastID == "" {
		return "products:initial"
	}
	return "products:last_id:" + req.LastID
}

func resolveStatus(item ozon.ProductItem) string {
	if item.Status != "" {
		return item.Status
	}
	return item.State
}

func fallbackName(v string) string {
	if v == "" {
		return "unnamed product"
	}
	return v
}

func nullableText(v string) pgtype.Text {
	if v == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{
		String: v,
		Valid:  true,
	}
}

func nullableInt64(v int64) pgtype.Int8 {
	if v == 0 {
		return pgtype.Int8{Valid: false}
	}
	return pgtype.Int8{
		Int64: v,
		Valid: true,
	}
}

func nullableNumeric(v string) pgtype.Numeric {
	if v == "" {
		return pgtype.Numeric{Valid: false}
	}
	var parsed pgtype.Numeric
	if err := parsed.Scan(v); err != nil {
		return pgtype.Numeric{Valid: false}
	}
	return parsed
}

func parseOptionalRFC3339(v string) (pgtype.Timestamptz, error) {
	if v == "" {
		return pgtype.Timestamptz{Valid: false}, nil
	}

	parsed, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return pgtype.Timestamptz{}, err
	}

	return pgtype.Timestamptz{
		Time:  parsed,
		Valid: true,
	}, nil
}
