package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/alerts"
	"go.uber.org/zap"
)

type fakePostSyncAccount struct {
	lastFrom, lastTo time.Time
	n                int
	err              error
}

func (f *fakePostSyncAccount) RebuildDailyAccountMetricsForDateRange(ctx context.Context, sellerAccountID int64, dateFrom, dateTo time.Time) (int, error) {
	f.lastFrom = dateFrom
	f.lastTo = dateTo
	return f.n, f.err
}

type fakePostSyncSKU struct {
	n   int
	err error
}

func (f *fakePostSyncSKU) RebuildDailySKUMetricsForDateRange(ctx context.Context, sellerAccountID int64, dateFrom, dateTo time.Time) (int, error) {
	return f.n, f.err
}

type fakePostSyncAlerts struct {
	lastAsOf time.Time
	lastType alerts.RunType
	summary  alerts.RunForAccountSummary
	err      error
}

func (f *fakePostSyncAlerts) RunForAccountWithType(ctx context.Context, sellerAccountID int64, asOfDate time.Time, runType alerts.RunType) (alerts.RunForAccountSummary, error) {
	f.lastAsOf = asOfDate
	f.lastType = runType
	return f.summary, f.err
}

func TestRecalculateAfterSyncHandler_runsDownstream(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	acc := &fakePostSyncAccount{n: 2}
	sku := &fakePostSyncSKU{n: 3}
	al := &fakePostSyncAlerts{
		summary: alerts.RunForAccountSummary{RunID: 99, Status: alerts.RunStatusCompleted},
	}
	h := NewRecalculateAfterSyncHandler(acc, sku, al, zap.NewNop())
	payload, err := json.Marshal(RecalculateAfterSyncPayload{SellerAccountID: 7, SyncJobID: 55})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.Handle(ctx, payload); err != nil {
		t.Fatal(err)
	}
	if acc.lastFrom.IsZero() || acc.lastTo.IsZero() {
		t.Fatal("expected date range on account rebuild")
	}
	if inclusive := int(acc.lastTo.Sub(acc.lastFrom)/(24*time.Hour)) + 1; inclusive != postSyncMetricsLookbackDays {
		t.Fatalf("expected %d inclusive days, got %d", postSyncMetricsLookbackDays, inclusive)
	}
	if al.lastType != alerts.RunTypePostSync {
		t.Fatalf("unexpected run type: %s", al.lastType)
	}
	if !postSyncCalendarDayUTC(time.Now()).Equal(al.lastAsOf) {
		t.Fatalf("expected as_of end-of-window today UTC")
	}
}

func TestRecalculateAfterSyncHandler_propagatesAccountError(t *testing.T) {
	t.Parallel()
	want := errors.New("boom")
	acc := &fakePostSyncAccount{err: want}
	h := NewRecalculateAfterSyncHandler(acc, &fakePostSyncSKU{}, &fakePostSyncAlerts{}, zap.NewNop())
	payload, _ := json.Marshal(RecalculateAfterSyncPayload{SellerAccountID: 1, SyncJobID: 2})
	if err := h.Handle(context.Background(), payload); !errors.Is(err, want) {
		t.Fatalf("expected wrapped boom, got %v", err)
	}
}

func TestRecalculateAfterSyncHandler_propagatesAlertsError(t *testing.T) {
	t.Parallel()
	want := errors.New("alerts down")
	al := &fakePostSyncAlerts{err: want}
	h := NewRecalculateAfterSyncHandler(&fakePostSyncAccount{n: 1}, &fakePostSyncSKU{n: 1}, al, zap.NewNop())
	payload, _ := json.Marshal(RecalculateAfterSyncPayload{SellerAccountID: 1, SyncJobID: 2})
	if err := h.Handle(context.Background(), payload); !errors.Is(err, want) {
		t.Fatalf("expected alerts error, got %v", err)
	}
}

func TestRecalculateAfterSyncHandler_idempotentRetries(t *testing.T) {
	t.Parallel()
	acc := &fakePostSyncAccount{n: 1}
	sku := &fakePostSyncSKU{n: 1}
	al := &fakePostSyncAlerts{summary: alerts.RunForAccountSummary{RunID: 1, Status: alerts.RunStatusCompleted}}
	h := NewRecalculateAfterSyncHandler(acc, sku, al, zap.NewNop())
	payload, _ := json.Marshal(RecalculateAfterSyncPayload{SellerAccountID: 1, SyncJobID: 2})
	ctx := context.Background()
	if err := h.Handle(ctx, payload); err != nil {
		t.Fatal(err)
	}
	if err := h.Handle(ctx, payload); err != nil {
		t.Fatal(err)
	}
}

func TestNewRecalculateAfterSyncTask_roundtrip(t *testing.T) {
	t.Parallel()
	task, err := NewRecalculateAfterSyncTask(10, 20)
	if err != nil {
		t.Fatal(err)
	}
	if task.Type() != TaskTypePostSyncRecalculation {
		t.Fatalf("type %q", task.Type())
	}
	var got RecalculateAfterSyncPayload
	if err := json.Unmarshal(task.Payload(), &got); err != nil {
		t.Fatal(err)
	}
	if got.SellerAccountID != 10 || got.SyncJobID != 20 {
		t.Fatalf("payload %+v", got)
	}
}
