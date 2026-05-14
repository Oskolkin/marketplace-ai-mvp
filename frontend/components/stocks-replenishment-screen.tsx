"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buttonClassNames } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getStocksReplenishment,
  type StocksReplenishmentItem,
  type StocksReplenishmentResponse,
} from "@/lib/analytics-api";

type StocksReplenishmentScreenProps = {
  initialAsOfDate?: string;
};

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function riskLabel(risk: string): string {
  return risk.replaceAll("_", " ");
}

function priorityClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "critical" || p === "high") return "bg-red-100 text-red-800";
  if (p === "medium") return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

function isHighReplenishmentPriority(priority: string): boolean {
  const p = priority.toLowerCase();
  return p === "high" || p === "critical";
}

function isOutOrCriticalDepletion(risk: string): boolean {
  const r = risk.toLowerCase();
  return r.includes("out_of_stock") || r.includes("out of stock") || r === "critical" || r.includes("critical");
}

function averageDaysOfCover(rows: StocksReplenishmentItem[]): number | null {
  const vals = rows.map((r) => r.days_of_cover).filter((d): d is number => d != null && Number.isFinite(d));
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return sum / vals.length;
}

function distinctSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export default function StocksReplenishmentScreen({
  initialAsOfDate,
}: StocksReplenishmentScreenProps) {
  const [response, setResponse] = useState<StocksReplenishmentResponse | null>(null);
  const [allRows, setAllRows] = useState<StocksReplenishmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");

        const data = await getStocksReplenishment(initialAsOfDate);
        setResponse(data);
        setAllRows(data.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stocks replenishment");
        setResponse(null);
        setAllRows([]);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [initialAsOfDate]);

  const priorityOptions = useMemo(
    () => distinctSorted(allRows.map((r) => r.replenishment_priority)),
    [allRows],
  );
  const riskOptions = useMemo(() => distinctSorted(allRows.map((r) => r.depletion_risk)), [allRows]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (priorityFilter && row.replenishment_priority !== priorityFilter) return false;
      if (riskFilter && row.depletion_risk !== riskFilter) return false;
      return true;
    });
  }, [allRows, priorityFilter, riskFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const highPriority = filteredRows.filter((r) => isHighReplenishmentPriority(r.replenishment_priority)).length;
    const outOrCritical = filteredRows.filter((r) => isOutOrCriticalDepletion(r.depletion_risk)).length;
    const avgCover = averageDaysOfCover(filteredRows);
    return { total, highPriority, outOrCritical, avgCover };
  }, [filteredRows]);

  if (loading) {
    return (
      <main className="space-y-6 p-6">
        <PageHeader
          title="Stocks & replenishment"
          subtitle="Operational stock snapshot with depletion risk and replenishment priority."
        />
        <LoadingState message="Loading stocks & replenishment…" />
      </main>
    );
  }

  if (error || !response) {
    return (
      <main className="space-y-6 p-6">
        <PageHeader
          title="Stocks & replenishment"
          subtitle="Operational stock snapshot with depletion risk and replenishment priority."
        />
        <ErrorState
          title="Could not load stocks"
          message={error || "Unknown error"}
          action={
            <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
              Back to Dashboard
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Stocks & replenishment"
        subtitle="Warehouse-aware stock view with replenishment priority and depletion risk."
        className="border-0 pb-0"
      >
        <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
          Dashboard
        </Link>
        <Link href="/app/critical-skus" className={buttonClassNames("secondary")}>
          Critical SKU
        </Link>
      </PageHeader>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Rows in view" value={fmtNumber(summary.total)} hint="After filters" />
        <MetricCard
          title="High / critical priority"
          value={fmtNumber(summary.highPriority)}
          hint="Replenishment priority"
        />
        <MetricCard
          title="Critical depletion"
          value={fmtNumber(summary.outOrCritical)}
          hint="Out of stock or critical risk label"
        />
        <MetricCard
          title="Avg. days of cover"
          value={summary.avgCover == null ? "—" : summary.avgCover.toFixed(1)}
          hint={summary.avgCover == null ? "No cover values in view" : "Mean over rows with data"}
        />
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Data window</CardTitle>
          <CardDescription>Server meta for the current request.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-gray-800">
          <p>
            <span className="font-medium text-gray-600">As of date:</span> {response.meta.as_of_date}
          </p>
          <p>
            <span className="font-medium text-gray-600">Last stock update:</span>{" "}
            {fmtDateTime(response.meta.last_stock_update)}
          </p>
          <p>
            <span className="font-medium text-gray-600">Stock semantics:</span> {response.meta.stock_semantics}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Client-side on loaded rows.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="min-w-[180px] text-sm">
            <span className="mb-1 block font-medium text-gray-700">Replenishment priority</span>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All priorities</option>
              {priorityOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[180px] text-sm">
            <span className="mb-1 block font-medium text-gray-700">Depletion risk</span>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="">All risks</option>
              {riskOptions.map((r) => (
                <option key={r} value={r}>
                  {riskLabel(r)}
                </option>
              ))}
            </select>
          </label>
          {(priorityFilter || riskFilter) && (
            <button
              type="button"
              className={buttonClassNames("secondary")}
              onClick={() => {
                setPriorityFilter("");
                setRiskFilter("");
              }}
            >
              Clear filters
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replenishment list</CardTitle>
          <CardDescription>
            {filteredRows.length === allRows.length
              ? `Showing all ${fmtNumber(filteredRows.length)} rows from the API.`
              : `Showing ${fmtNumber(filteredRows.length)} of ${fmtNumber(allRows.length)} rows.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <EmptyState
              title={allRows.length === 0 ? "No stock rows" : "No matching rows"}
              message={
                allRows.length === 0
                  ? "No rows for the selected period."
                  : "Try clearing filters to see the full list."
              }
              action={
                allRows.length > 0 ? (
                  <button
                    type="button"
                    className={buttonClassNames("secondary")}
                    onClick={() => {
                      setPriorityFilter("");
                      setRiskFilter("");
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
                    Sync status
                  </Link>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">SKU / Product</th>
                    <th className="px-2 py-2">Available stock</th>
                    <th className="px-2 py-2">Reserved</th>
                    <th className="px-2 py-2">Total</th>
                    <th className="px-2 py-2">Days of cover</th>
                    <th className="px-2 py-2">Out of stock risk</th>
                    <th className="px-2 py-2">Replenishment priority</th>
                    <th className="px-2 py-2">Warehouse count</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={`${row.ozon_product_id}-${row.offer_id ?? ""}-${row.sku ?? ""}`} className="border-b align-top">
                      <td className="px-2 py-2">
                        <div className="font-medium">{row.product_name || "—"}</div>
                        <div className="text-xs text-gray-500">
                          product_id={row.ozon_product_id} | offer={row.offer_id || "—"} | sku=
                          {row.sku ?? "—"}
                        </div>
                      </td>
                      <td className="px-2 py-2">{fmtNumber(row.current_available_stock)}</td>
                      <td className="px-2 py-2">{fmtNumber(row.current_reserved_stock)}</td>
                      <td className="px-2 py-2">{fmtNumber(row.current_total_stock)}</td>
                      <td className="px-2 py-2">
                        {row.days_of_cover == null ? "—" : row.days_of_cover.toFixed(2)}
                      </td>
                      <td className="px-2 py-2">{riskLabel(row.depletion_risk)}</td>
                      <td className="px-2 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${priorityClass(row.replenishment_priority)}`}
                        >
                          {row.replenishment_priority}
                        </span>
                      </td>
                      <td className="px-2 py-2">{fmtNumber(row.warehouse_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
