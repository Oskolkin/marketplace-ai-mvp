package analytics

import (
	"context"
	"fmt"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AccountMetricsService struct {
	db      *pgxpool.Pool
	queries *dbgen.Queries
}

func NewAccountMetricsService(db *pgxpool.Pool) *AccountMetricsService {
	return &AccountMetricsService{
		db:      db,
		queries: dbgen.New(db),
	}
}

func (s *AccountMetricsService) RebuildDailyAccountMetricsForSellerAccount(ctx context.Context, sellerAccountID int64) error {
	bounds, err := s.queries.GetDailyAccountMetricSourceDateBoundsBySellerAccountID(ctx, sellerAccountID)
	if err != nil {
		return fmt.Errorf("get source date bounds: %w", err)
	}
	if !bounds.MinDate.Valid || !bounds.MaxDate.Valid {
		return nil
	}

	return s.RebuildDailyAccountMetricsForDateRange(
		ctx,
		sellerAccountID,
		bounds.MinDate.Time,
		bounds.MaxDate.Time,
	)
}

func (s *AccountMetricsService) RebuildDailyAccountMetricsForDateRange(
	ctx context.Context,
	sellerAccountID int64,
	dateFrom time.Time,
	dateTo time.Time,
) error {
	fromDate := normalizeDate(dateFrom)
	toDate := normalizeDate(dateTo)
	if toDate.Before(fromDate) {
		return fmt.Errorf("invalid date range: to (%s) is before from (%s)", toDate.Format("2006-01-02"), fromDate.Format("2006-01-02"))
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	_, err = qtx.GetSellerAccountByID(ctx, sellerAccountID)
	if err != nil {
		return fmt.Errorf("get seller account: %w", err)
	}

	sources, err := qtx.ListDailyAccountMetricSourcesBySellerAndDateRange(ctx, dbgen.ListDailyAccountMetricSourcesBySellerAndDateRangeParams{
		SellerAccountID: sellerAccountID,
		Column2:         dateValue(fromDate),
		Column3:         dateValue(toDate),
	})
	if err != nil {
		return fmt.Errorf("list account metric sources: %w", err)
	}

	if err := qtx.DeleteDailyAccountMetricsBySellerAndDateRange(ctx, dbgen.DeleteDailyAccountMetricsBySellerAndDateRangeParams{
		SellerAccountID: sellerAccountID,
		MetricDate:      dateValue(fromDate),
		MetricDate_2:    dateValue(toDate),
	}); err != nil {
		return fmt.Errorf("delete daily account metrics in range: %w", err)
	}

	for _, row := range sources {
		if _, err := qtx.UpsertDailyAccountMetric(ctx, dbgen.UpsertDailyAccountMetricParams{
			SellerAccountID: sellerAccountID,
			MetricDate:      row.MetricDate,
			Revenue:         row.Revenue,
			OrdersCount:     row.OrdersCount,
			ReturnsCount:    row.ReturnsCount,
			CancelCount:     row.CancelCount,
		}); err != nil {
			return fmt.Errorf("upsert daily account metric for date %s: %w", row.MetricDate.Time.Format("2006-01-02"), err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func dateValue(t time.Time) pgtype.Date {
	return pgtype.Date{
		Time:  normalizeDate(t),
		Valid: true,
	}
}

func normalizeDate(t time.Time) time.Time {
	return time.Date(t.UTC().Year(), t.UTC().Month(), t.UTC().Day(), 0, 0, 0, 0, time.UTC)
}
