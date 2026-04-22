"use client";

import { useEffect, useState } from "react";
import {
  getDashboardSKUTable,
  getDashboardStocks,
  getDashboardSummary,
  type DashboardSkuRow,
  type DashboardStockRow,
  type DashboardSummaryResponse,
} from "@/lib/analytics-api";

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtNum(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

type DashboardState = {
  summary: DashboardSummaryResponse | null;
  skuRows: DashboardSkuRow[];
  stocksRows: DashboardStockRow[];
};

type DashboardScreenProps = {
  initialAsOfDate?: string;
};

export default function DashboardScreen({ initialAsOfDate }: DashboardScreenProps) {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    skuRows: [],
    stocksRows: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");

        const [summary, skuTable, stocks] = await Promise.all([
          getDashboardSummary(initialAsOfDate),
          getDashboardSKUTable({
            asOfDate: initialAsOfDate,
            limit: 20,
            offset: 0,
            sortBy: "revenue",
            sortOrder: "desc",
          }),
          getDashboardStocks(),
        ]);

        const safeSkuItems = skuTable?.items ?? [];
        const safeStocksItems = stocks?.items ?? [];

        setState({
          summary,
          skuRows: safeSkuItems.slice(0, 20),
          stocksRows: safeStocksItems.slice(0, 20),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [initialAsOfDate]);

  if (loading) {
    return <main className="p-6">Loading dashboard...</main>;
  }

  if (error || !state.summary) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error || "Failed to load dashboard summary"}</p>
      </main>
    );
  }

  const { kpi, summary } = state.summary;

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard v1</h1>
        <p className="text-sm text-gray-600">Revenue, orders, returns, cancels and key table previews.</p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Revenue"
          value={fmtMoney(kpi.revenue_current)}
          sub={`DoD ${fmtMoney(kpi.revenue_day_to_day_delta.abs)} | WoW ${fmtMoney(kpi.revenue_week_to_week_delta.abs)}`}
        />
        <MetricCard
          title="Orders"
          value={fmtNum(kpi.orders_current)}
          sub={`DoD ${fmtNum(kpi.orders_day_to_day_delta)}`}
        />
        <MetricCard title="Returns" value={fmtNum(kpi.returns_current)} sub="Current day" />
        <MetricCard title="Cancels" value={fmtNum(kpi.cancels_current)} sub="Current day" />
      </section>

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-3 text-lg font-semibold">Summary</h2>
        <p>
          <span className="font-medium">Last successful update:</span>{" "}
          {fmtDateTime(summary.last_successful_update)}
        </p>
        <p>
          <span className="font-medium">Period used:</span> {summary.period_used}
        </p>
        <p>
          <span className="font-medium">As of date:</span> {summary.as_of_date} ({summary.as_of_date_source})
        </p>
        <p>
          <span className="font-medium">Data freshness:</span> {summary.data_freshness}
        </p>
        <p>
          <span className="font-medium">KPI semantics:</span> {summary.kpi_semantics}
        </p>
        <p>
          <span className="font-medium">SKU orders semantics:</span> {summary.sku_orders_semantics}
        </p>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">SKU table (top 20)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Revenue</th>
                <th className="px-2 py-2">Sales ops</th>
                <th className="px-2 py-2">Share</th>
                <th className="px-2 py-2">Contribution</th>
                <th className="px-2 py-2">Stock</th>
                <th className="px-2 py-2">Days of cover</th>
              </tr>
            </thead>
            <tbody>
              {state.skuRows.map((row) => (
                <tr key={`${row.ozon_product_id}`} className="border-b align-top">
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.product_name || "—"}</div>
                    <div className="text-xs text-gray-500">
                      product_id={row.ozon_product_id} | offer={row.offer_id || "—"} | sku={row.sku ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-2">{fmtMoney(row.revenue)}</td>
                  <td className="px-2 py-2">{fmtNum(row.orders_count)}</td>
                  <td className="px-2 py-2">{row.share_of_revenue == null ? "—" : `${(row.share_of_revenue * 100).toFixed(1)}%`}</td>
                  <td className="px-2 py-2">{fmtMoney(row.contribution_to_revenue_change)}</td>
                  <td className="px-2 py-2">{fmtNum(row.stock_available)}</td>
                  <td className="px-2 py-2">{row.days_of_cover == null ? "—" : row.days_of_cover.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Stocks table (top 20 warehouse rows)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Warehouse</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Reserved</th>
                <th className="px-2 py-2">Available</th>
                <th className="px-2 py-2">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {state.stocksRows.map((row) => (
                <tr key={`${row.ozon_product_id}-${row.warehouse}`} className="border-b align-top">
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.product_name || "—"}</div>
                    <div className="text-xs text-gray-500">
                      product_id={row.ozon_product_id} | offer={row.offer_id || "—"} | sku={row.sku ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-2">{row.warehouse}</td>
                  <td className="px-2 py-2">{fmtNum(row.quantity_total)}</td>
                  <td className="px-2 py-2">{fmtNum(row.quantity_reserved)}</td>
                  <td className="px-2 py-2">{fmtNum(row.quantity_available)}</td>
                  <td className="px-2 py-2">{fmtDateTime(row.snapshot_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function MetricCard(props: { title: string; value: string; sub: string }) {
  return (
    <article className="rounded border p-4">
      <h3 className="text-sm text-gray-600">{props.title}</h3>
      <p className="mt-1 text-2xl font-semibold">{props.value}</p>
      <p className="mt-2 text-xs text-gray-500">{props.sub}</p>
    </article>
  );
}
