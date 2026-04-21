package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/analytics"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
)

type AnalyticsDashboardHandler struct {
	dashboardService *analytics.DashboardService
	stocksService    *analytics.StocksViewService
}

func NewAnalyticsDashboardHandler(
	dashboardService *analytics.DashboardService,
	stocksService *analytics.StocksViewService,
) *AnalyticsDashboardHandler {
	return &AnalyticsDashboardHandler{
		dashboardService: dashboardService,
		stocksService:    stocksService,
	}
}

type dashboardSummaryResponse struct {
	KPI struct {
		RevenueCurrent         float64                  `json:"revenue_current"`
		RevenueDayToDayDelta   analytics.DashboardDelta `json:"revenue_day_to_day_delta"`
		RevenueWeekToWeekDelta analytics.DashboardDelta `json:"revenue_week_to_week_delta"`
		OrdersCurrent          int32                    `json:"orders_current"`
		OrdersDayToDayDelta    int32                    `json:"orders_day_to_day_delta"`
		ReturnsCurrent         int32                    `json:"returns_current"`
		CancelsCurrent         int32                    `json:"cancels_current"`
	} `json:"kpi"`
	Summary struct {
		LastSuccessfulUpdate *string `json:"last_successful_update"`
		PeriodUsed           string  `json:"period_used"`
		DataFreshness        string  `json:"data_freshness"`
	} `json:"summary"`
	TopSKUs []analytics.DashboardSKUMetricsItem `json:"top_skus"`
}

type skuTableResponse struct {
	Items  []analytics.DashboardSKUMetricsItem `json:"items"`
	Total  int                                 `json:"total"`
	Limit  int                                 `json:"limit"`
	Offset int                                 `json:"offset"`
}

type stockTableWarehouseRow struct {
	OzonProductID     int64   `json:"ozon_product_id"`
	OfferID           *string `json:"offer_id"`
	SKU               *int64  `json:"sku"`
	ProductName       *string `json:"product_name"`
	Warehouse         string  `json:"warehouse"`
	QuantityTotal     int32   `json:"quantity_total"`
	QuantityReserved  int32   `json:"quantity_reserved"`
	QuantityAvailable int32   `json:"quantity_available"`
	SnapshotAt        *string `json:"snapshot_at"`
}

type stocksTableResponse struct {
	Items []stockTableWarehouseRow `json:"items"`
	Total int                      `json:"total"`
}

func (h *AnalyticsDashboardHandler) GetDashboardSummary(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	asOf := time.Now().UTC()
	asOfRaw := r.URL.Query().Get("as_of_date")
	if asOfRaw != "" {
		parsed, err := time.Parse("2006-01-02", asOfRaw)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid as_of_date, expected YYYY-MM-DD")
			return
		}
		asOf = parsed
	}

	dto, err := h.dashboardService.BuildDashboardMetrics(r.Context(), sellerAccount.ID, asOf)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to build dashboard summary")
		return
	}

	response := mapDashboardSummaryResponse(dto)
	writeJSON(w, http.StatusOK, response)
}

func (h *AnalyticsDashboardHandler) GetSKUTable(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	asOf, err := parseAsOfDate(r)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid as_of_date, expected YYYY-MM-DD")
		return
	}

	dto, err := h.dashboardService.BuildDashboardMetrics(r.Context(), sellerAccount.ID, asOf)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to build sku table")
		return
	}

	limit, offset := parsePaginationParams(r)
	sortBy := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("sort_by")))
	sortOrder := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("sort_order")))
	rows := append([]analytics.DashboardSKUMetricsItem(nil), dto.SKUs...)
	sortSKURows(rows, sortBy, sortOrder)

	total := len(rows)
	start := minInt(offset, total)
	end := minInt(start+limit, total)

	writeJSON(w, http.StatusOK, skuTableResponse{
		Items:  rows[start:end],
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func (h *AnalyticsDashboardHandler) GetStocksTable(w http.ResponseWriter, r *http.Request) {
	sellerAccount, ok := auth.SellerAccountFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.stocksService.ListCurrentStocksBySellerAccount(r.Context(), sellerAccount.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to build stocks table")
		return
	}

	flatRows := make([]stockTableWarehouseRow, 0)
	for _, product := range rows {
		for _, warehouse := range product.Warehouses {
			flatRows = append(flatRows, stockTableWarehouseRow{
				OzonProductID:     product.OzonProductID,
				OfferID:           product.OfferID,
				SKU:               product.SKU,
				ProductName:       product.ProductName,
				Warehouse:         warehouse.WarehouseExternalID,
				QuantityTotal:     warehouse.TotalStock,
				QuantityReserved:  warehouse.ReservedStock,
				QuantityAvailable: warehouse.AvailableStock,
				SnapshotAt:        warehouse.SnapshotAt,
			})
		}
	}

	sort.Slice(flatRows, func(i, j int) bool {
		if flatRows[i].QuantityAvailable == flatRows[j].QuantityAvailable {
			if flatRows[i].OzonProductID == flatRows[j].OzonProductID {
				return flatRows[i].Warehouse < flatRows[j].Warehouse
			}
			return flatRows[i].OzonProductID < flatRows[j].OzonProductID
		}
		return flatRows[i].QuantityAvailable > flatRows[j].QuantityAvailable
	})

	writeJSON(w, http.StatusOK, stocksTableResponse{
		Items: flatRows,
		Total: len(flatRows),
	})
}

func mapDashboardSummaryResponse(dto analytics.DashboardMetricsDTO) dashboardSummaryResponse {
	response := dashboardSummaryResponse{}
	response.KPI.RevenueCurrent = dto.Account.RevenueToday
	response.KPI.RevenueDayToDayDelta = dto.Account.RevenueDayDelta
	response.KPI.RevenueWeekToWeekDelta = dto.Account.RevenueWeekDelta
	response.KPI.OrdersCurrent = dto.Account.OrdersToday
	response.KPI.OrdersDayToDayDelta = dto.Account.OrdersToday - dto.Account.OrdersYesterday
	response.KPI.ReturnsCurrent = dto.Account.ReturnsToday
	response.KPI.CancelsCurrent = dto.Account.CancelsToday

	response.Summary.LastSuccessfulUpdate = dto.LastUpdatedAt
	response.Summary.PeriodUsed = buildPeriodUsed(dto.AsOfDate)
	response.Summary.DataFreshness = resolveDataFreshness(dto.AsOfDate)

	top := dto.SKUs
	if len(top) > 5 {
		top = top[:5]
	}
	response.TopSKUs = top
	return response
}

func parseAsOfDate(r *http.Request) (time.Time, error) {
	asOfRaw := r.URL.Query().Get("as_of_date")
	if strings.TrimSpace(asOfRaw) == "" {
		return time.Now().UTC(), nil
	}
	return time.Parse("2006-01-02", asOfRaw)
}

func parsePaginationParams(r *http.Request) (int, int) {
	limit := 20
	offset := 0

	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	return limit, offset
}

func sortSKURows(rows []analytics.DashboardSKUMetricsItem, sortBy string, sortOrder string) {
	desc := sortOrder != "asc"
	if sortBy == "" {
		sortBy = "revenue"
	}

	sort.Slice(rows, func(i, j int) bool {
		left := rows[i]
		right := rows[j]

		switch sortBy {
		case "orders_count":
			if left.OrdersCount == right.OrdersCount {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return left.OrdersCount > right.OrdersCount
			}
			return left.OrdersCount < right.OrdersCount
		case "share_of_revenue":
			lv := safeFloat(left.ShareOfRevenue)
			rv := safeFloat(right.ShareOfRevenue)
			if lv == rv {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return lv > rv
			}
			return lv < rv
		case "contribution_to_revenue_change":
			if left.ContributionToRevenueChange == right.ContributionToRevenueChange {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return left.ContributionToRevenueChange > right.ContributionToRevenueChange
			}
			return left.ContributionToRevenueChange < right.ContributionToRevenueChange
		case "stock_available":
			if left.StockAvailable == right.StockAvailable {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return left.StockAvailable > right.StockAvailable
			}
			return left.StockAvailable < right.StockAvailable
		case "days_of_cover":
			lv := safeFloat(left.DaysOfCover)
			rv := safeFloat(right.DaysOfCover)
			if lv == rv {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return lv > rv
			}
			return lv < rv
		case "product_name":
			ln := strings.ToLower(safeString(left.ProductName))
			rn := strings.ToLower(safeString(right.ProductName))
			if ln == rn {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return ln > rn
			}
			return ln < rn
		default:
			if left.Revenue == right.Revenue {
				return left.OzonProductID < right.OzonProductID
			}
			if desc {
				return left.Revenue > right.Revenue
			}
			return left.Revenue < right.Revenue
		}
	})
}

func safeFloat(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

func safeString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func buildPeriodUsed(asOfDate string) string {
	return asOfDate + " (d) / last 7 days for WoW"
}

func resolveDataFreshness(asOfDate string) string {
	asOf, err := time.Parse("2006-01-02", asOfDate)
	if err != nil {
		return "unknown"
	}

	daysLag := int(time.Since(asOf.UTC()).Hours() / 24)
	switch {
	case daysLag <= 0:
		return "fresh"
	case daysLag <= 1:
		return "stale_1d"
	default:
		return "stale"
	}
}
