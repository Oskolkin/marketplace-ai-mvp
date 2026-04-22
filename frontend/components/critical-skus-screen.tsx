"use client";

import { useEffect, useState } from "react";
import {
  getCriticalSKUs,
  type CriticalSKUItem,
  type CriticalSKUsResponse,
} from "@/lib/analytics-api";

type CriticalSKUsScreenProps = {
  initialAsOfDate?: string;
};

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function badgeLabel(badge: string): string {
  const key = badge.toLowerCase();
  if (key.includes("revenue_down")) return "sales down";
  if (key.includes("sales_ops_down")) return "ops down";
  if (key.includes("out_of_stock")) return "out of stock";
  if (key.includes("low_stock")) return "low stock";
  if (key.includes("high_importance")) return "high importance";
  return badge.replaceAll("_", " ").toLowerCase();
}

function badgeClass(badge: string): string {
  const key = badge.toLowerCase();
  if (key.includes("out_of_stock")) return "bg-red-100 text-red-800";
  if (key.includes("low_stock")) return "bg-orange-100 text-orange-800";
  if (key.includes("revenue_down") || key.includes("sales_ops_down")) {
    return "bg-amber-100 text-amber-800";
  }
  if (key.includes("high_importance")) return "bg-purple-100 text-purple-800";
  return "bg-gray-100 text-gray-700";
}

export default function CriticalSKUsScreen({ initialAsOfDate }: CriticalSKUsScreenProps) {
  const [response, setResponse] = useState<CriticalSKUsResponse | null>(null);
  const [rows, setRows] = useState<CriticalSKUItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");

        const data = await getCriticalSKUs({
          asOfDate: initialAsOfDate,
          limit: 20,
          offset: 0,
          sortBy: "problem_score",
          sortOrder: "desc",
        });
        setResponse(data);
        setRows(data.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load critical SKUs");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [initialAsOfDate]);

  if (loading) {
    return <main className="p-6">Loading critical SKUs...</main>;
  }

  if (error || !response) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error || "Failed to load critical SKUs"}</p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Critical SKU</h1>
        <p className="text-sm text-gray-600">
          Operational ranking of problematic SKUs sorted by problem score.
        </p>
      </div>

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-3 text-lg font-semibold">Meta</h2>
        <p>
          <span className="font-medium">As of date:</span> {response.meta.as_of_date}
        </p>
        <p>
          <span className="font-medium">Latest data timestamp:</span>{" "}
          {fmtDateTime(response.meta.latest_data_timestamp)}
        </p>
        <p>
          <span className="font-medium">Default sorting:</span> {response.meta.sort_by}{" "}
          ({response.meta.sort_order})
        </p>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Problematic SKUs ({rows.length})</h2>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-600">No critical SKUs for selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">SKU / Product</th>
                  <th className="px-2 py-2">Problem score</th>
                  <th className="px-2 py-2">Revenue</th>
                  <th className="px-2 py-2">Sales ops</th>
                  <th className="px-2 py-2">Revenue delta</th>
                  <th className="px-2 py-2">Ops delta</th>
                  <th className="px-2 py-2">Stock</th>
                  <th className="px-2 py-2">Days cover</th>
                  <th className="px-2 py-2">Risk</th>
                  <th className="px-2 py-2">Importance</th>
                  <th className="px-2 py-2">Badges / signals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ozon_product_id} className="border-b align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.product_name || "—"}</div>
                      <div className="text-xs text-gray-500">
                        product_id={row.ozon_product_id} | offer={row.offer_id || "—"} | sku=
                        {row.sku ?? "—"}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-semibold">{row.problem_score.toFixed(2)}</td>
                    <td className="px-2 py-2">{fmtMoney(row.revenue)}</td>
                    <td className="px-2 py-2">{fmtNumber(row.sales_ops)}</td>
                    <td className="px-2 py-2">{fmtMoney(row.revenue_delta_day)}</td>
                    <td className="px-2 py-2">{fmtNumber(row.orders_delta_day)}</td>
                    <td className="px-2 py-2">{fmtNumber(row.stock_available)}</td>
                    <td className="px-2 py-2">
                      {row.days_of_cover == null ? "—" : row.days_of_cover.toFixed(2)}
                    </td>
                    <td className="px-2 py-2">{row.out_of_stock_risk.toFixed(2)}</td>
                    <td className="px-2 py-2">{row.importance.toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(row.badges ?? []).map((badge) => (
                          <span
                            key={`${row.ozon_product_id}-${badge}`}
                            className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(badge)}`}
                          >
                            {badgeLabel(badge)}
                          </span>
                        ))}
                      </div>
                      {(row.signals ?? []).length > 0 ? (
                        <p className="mt-1 text-xs text-gray-500">
                          signals: {(row.signals ?? []).join(", ")}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
