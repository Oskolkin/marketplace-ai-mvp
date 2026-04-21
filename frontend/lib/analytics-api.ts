import { apiGet } from "@/lib/api";

export type DashboardDelta = {
  abs: number;
  pct: number | null;
};

export type DashboardSummaryResponse = {
  kpi: {
    revenue_current: number;
    revenue_day_to_day_delta: DashboardDelta;
    revenue_week_to_week_delta: DashboardDelta;
    orders_current: number;
    orders_day_to_day_delta: number;
    returns_current: number;
    cancels_current: number;
  };
  summary: {
    last_successful_update: string | null;
    period_used: string;
    data_freshness: string;
  };
  top_skus: DashboardSkuRow[];
};

export type DashboardSkuRow = {
  ozon_product_id: number;
  offer_id: string | null;
  sku: number | null;
  product_name: string | null;
  revenue: number;
  orders_count: number;
  share_of_revenue: number | null;
  contribution_to_revenue_change: number;
  stock_available: number;
  days_of_cover: number | null;
};

export type DashboardSkuTableResponse = {
  items: DashboardSkuRow[];
  total: number;
  limit: number;
  offset: number;
};

export type DashboardStockRow = {
  ozon_product_id: number;
  offer_id: string | null;
  sku: number | null;
  product_name: string | null;
  warehouse: string;
  quantity_total: number;
  quantity_reserved: number;
  quantity_available: number;
  snapshot_at: string | null;
};

export type DashboardStocksResponse = {
  items: DashboardStockRow[];
  total: number;
};

export type SKUQueryParams = {
  asOfDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function getDashboardSummary(
  asOfDate?: string
): Promise<DashboardSummaryResponse> {
  const query = buildQuery({ as_of_date: asOfDate });
  return apiGet<DashboardSummaryResponse>(`/api/v1/analytics/dashboard${query}`);
}

export async function getDashboardSKUTable(
  params: SKUQueryParams
): Promise<DashboardSkuTableResponse> {
  const query = buildQuery({
    as_of_date: params.asOfDate,
    limit: params.limit,
    offset: params.offset,
    sort_by: params.sortBy,
    sort_order: params.sortOrder,
  });
  return apiGet<DashboardSkuTableResponse>(`/api/v1/analytics/sku-table${query}`);
}

export async function getDashboardStocks(): Promise<DashboardStocksResponse> {
  return apiGet<DashboardStocksResponse>("/api/v1/analytics/stocks");
}
