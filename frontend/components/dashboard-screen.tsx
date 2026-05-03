"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getDashboardSKUTable,
  getDashboardStocks,
  getDashboardSummary,
  type DashboardSkuRow,
  type DashboardStockRow,
  type DashboardSummaryResponse,
} from "@/lib/analytics-api";
import {
  getAlerts,
  getAlertsSummary,
  type AlertItem,
  type AlertsSummaryResponse,
} from "@/lib/alerts-api";
import {
  getRecommendations,
  getRecommendationsSummary,
  type RecommendationItem,
  type RecommendationsSummary,
} from "@/lib/recommendations-api";

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

function fmtRecEntity(row: Pick<RecommendationItem, "entity_sku" | "entity_offer_id" | "entity_id" | "entity_type">): string {
  if (row.entity_sku != null) return `SKU: ${row.entity_sku}`;
  if (row.entity_offer_id) return `Offer: ${row.entity_offer_id}`;
  if (row.entity_id) return `ID: ${row.entity_id}`;
  return row.entity_type;
}

type DashboardState = {
  summary: DashboardSummaryResponse | null;
  skuRows: DashboardSkuRow[];
  stocksRows: DashboardStockRow[];
  alertsSummary: AlertsSummaryResponse | null;
  topAlerts: AlertItem[];
  recSummary: RecommendationsSummary | null;
  topRecommendations: RecommendationItem[];
};

type DashboardScreenProps = {
  initialAsOfDate?: string;
};

export default function DashboardScreen({ initialAsOfDate }: DashboardScreenProps) {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    skuRows: [],
    stocksRows: [],
    alertsSummary: null,
    topAlerts: [],
    recSummary: null,
    topRecommendations: [],
  });
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState("");
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        setAlertsLoading(true);
        setAlertsError("");
        setRecLoading(true);
        setRecError("");

        const [summary, skuTable, stocks, alertsSummary, criticalAlerts] = await Promise.all([
          getDashboardSummary(initialAsOfDate),
          getDashboardSKUTable({
            asOfDate: initialAsOfDate,
            limit: 20,
            offset: 0,
            sortBy: "revenue",
            sortOrder: "desc",
          }),
          getDashboardStocks(),
          getAlertsSummary(),
          getAlerts({ status: "open", severity: "critical", limit: 3, offset: 0 }),
        ]);

        let topAlerts = criticalAlerts.items ?? [];
        if (topAlerts.length === 0) {
          const highAlerts = await getAlerts({
            status: "open",
            severity: "high",
            limit: 3,
            offset: 0,
          });
          topAlerts = highAlerts.items ?? [];
        }

        const safeSkuItems = skuTable?.items ?? [];
        const safeStocksItems = stocks?.items ?? [];

        setState({
          summary,
          skuRows: safeSkuItems.slice(0, 20),
          stocksRows: safeStocksItems.slice(0, 20),
          alertsSummary,
          topAlerts,
          recSummary: null,
          topRecommendations: [],
        });
        setLoading(false);
        setAlertsLoading(false);

        let recSummary: RecommendationsSummary | null = null;
        let topRecommendations: RecommendationItem[] = [];
        try {
          setRecLoading(true);
          setRecError("");
          recSummary = await getRecommendationsSummary();
          const criticalRecs = await getRecommendations({
            status: "open",
            priority_level: "critical",
            limit: 3,
            offset: 0,
          });
          topRecommendations = criticalRecs.items ?? [];
          if (topRecommendations.length === 0) {
            const highRecs = await getRecommendations({
              status: "open",
              priority_level: "high",
              limit: 3,
              offset: 0,
            });
            topRecommendations = highRecs.items ?? [];
          }
        } catch (recErr) {
          setRecError(
            recErr instanceof Error ? recErr.message : "Failed to load recommendations teaser",
          );
        } finally {
          setRecLoading(false);
        }

        setState((prev) => ({
          ...prev,
          recSummary,
          topRecommendations,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setAlertsError(
          err instanceof Error ? err.message : "Failed to load alerts teaser"
        );
        setRecLoading(false);
      } finally {
        setLoading(false);
        setAlertsLoading(false);
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Alerts teaser</h2>
          <Link href="/app/alerts" className="rounded border px-3 py-1 text-sm hover:bg-gray-50">
            View alerts
          </Link>
        </div>
        {alertsLoading ? (
          <p className="text-sm">Loading alerts teaser...</p>
        ) : alertsError ? (
          <p className="text-sm text-red-600">{alertsError}</p>
        ) : !state.alertsSummary ? (
          <p className="text-sm text-gray-600">Alerts summary is unavailable.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetricCard
                title="Open alerts"
                value={fmtNum(state.alertsSummary.open_total)}
                sub="Current seller account"
              />
              <MetricCard
                title="Critical"
                value={fmtNum(state.alertsSummary.critical_count)}
                sub="Open critical alerts"
              />
              <MetricCard
                title="High"
                value={fmtNum(state.alertsSummary.high_count)}
                sub="Open high alerts"
              />
            </div>

            {state.alertsSummary.latest_run ? (
              <p className="text-xs text-gray-600">
                latest_run: status={state.alertsSummary.latest_run.status}, started=
                {fmtDateTime(state.alertsSummary.latest_run.started_at)}, finished=
                {fmtDateTime(state.alertsSummary.latest_run.finished_at)}, total=
                {state.alertsSummary.latest_run.total_alerts_count}
              </p>
            ) : (
              <p className="text-xs text-gray-600">latest_run: no runs yet</p>
            )}

            {state.alertsSummary.open_total === 0 ? (
              <p className="rounded border border-green-300 bg-green-50 p-2 text-green-700">
                No open alerts.
              </p>
            ) : state.topAlerts.length === 0 ? (
              <p className="text-gray-600">No critical/high alerts to highlight.</p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Top critical/high alerts</p>
                <div className="space-y-2">
                  {state.topAlerts.map((a) => (
                    <Link
                      href="/app/alerts"
                      key={a.id}
                      className="block rounded border p-2 hover:bg-gray-50"
                    >
                      <p className="text-xs text-gray-600">
                        {a.severity} | {a.alert_group}
                      </p>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-gray-600">
                        {a.entity_sku != null
                          ? `SKU ${a.entity_sku}`
                          : a.entity_offer_id || a.entity_id || a.entity_type}
                        {" | "}last_seen={fmtDateTime(a.last_seen_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">AI recommendations teaser</h2>
          <Link href="/app/recommendations" className="rounded border px-3 py-1 text-sm hover:bg-gray-50">
            View recommendations
          </Link>
        </div>
        {recLoading ? (
          <p className="text-sm">Loading recommendations teaser...</p>
        ) : recError ? (
          <p className="text-sm text-red-600">{recError}</p>
        ) : !state.recSummary ? (
          <p className="text-sm text-gray-600">Recommendations summary is unavailable.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetricCard
                title="Open recommendations"
                value={fmtNum(state.recSummary.open_total)}
                sub="Open items for this account"
              />
              <MetricCard
                title="Critical"
                value={fmtNum(state.recSummary.by_priority.critical)}
                sub="Open by priority"
              />
              <MetricCard
                title="High"
                value={fmtNum(state.recSummary.by_priority.high)}
                sub="Open by priority"
              />
            </div>

            {state.recSummary.latest_run ? (
              <p className="text-xs text-gray-600">
                latest_run: status={state.recSummary.latest_run.status}, ai_model=
                {state.recSummary.latest_run.ai_model ?? "—"}, ai_prompt_version=
                {state.recSummary.latest_run.ai_prompt_version ?? "—"}, generated=
                {state.recSummary.latest_run.generated_recommendations_count}, started=
                {fmtDateTime(state.recSummary.latest_run.started_at)}, finished=
                {fmtDateTime(state.recSummary.latest_run.finished_at)}
              </p>
            ) : (
              <p className="text-xs text-gray-600">latest_run: no runs yet</p>
            )}

            {state.recSummary.open_total === 0 ? (
              <p className="rounded border border-green-300 bg-green-50 p-2 text-green-700">
                No open recommendations.
              </p>
            ) : state.topRecommendations.length === 0 ? (
              <p className="text-gray-600">No critical/high open recommendations to highlight.</p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Top open critical / high</p>
                <div className="space-y-2">
                  {state.topRecommendations.map((r) => (
                    <Link
                      href="/app/recommendations"
                      key={r.id}
                      className="block rounded border p-2 hover:bg-gray-50"
                    >
                      <p className="text-xs text-gray-600">
                        <span className="inline-flex rounded border px-1.5 py-0.5">{r.priority_level}</span>{" "}
                        <span className="inline-flex rounded border px-1.5 py-0.5">{r.confidence_level}</span>{" "}
                        <span className="inline-flex rounded border px-1.5 py-0.5">{r.horizon}</span>
                      </p>
                      <p className="font-medium">{r.title}</p>
                      <p className="line-clamp-2 text-xs text-gray-700">{r.recommended_action}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {fmtRecEntity(r)} | last_seen={fmtDateTime(r.last_seen_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
