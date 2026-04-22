"use client";

import { useEffect, useState } from "react";
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
  if (priority === "high") return "bg-red-100 text-red-800";
  if (priority === "medium") return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

export default function StocksReplenishmentScreen({
  initialAsOfDate,
}: StocksReplenishmentScreenProps) {
  const [response, setResponse] = useState<StocksReplenishmentResponse | null>(null);
  const [rows, setRows] = useState<StocksReplenishmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");

        const data = await getStocksReplenishment(initialAsOfDate);
        setResponse(data);
        setRows((data.items ?? []).slice(0, 20));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stocks replenishment");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [initialAsOfDate]);

  if (loading) {
    return <main className="p-6">Loading stocks & replenishment...</main>;
  }

  if (error || !response) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error || "Failed to load stocks & replenishment"}</p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Stocks & Replenishment</h1>
        <p className="text-sm text-gray-600">
          Operational stock snapshot with depletion risk and replenishment priority.
        </p>
      </div>

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-3 text-lg font-semibold">Meta</h2>
        <p>
          <span className="font-medium">As of date:</span> {response.meta.as_of_date}
        </p>
        <p>
          <span className="font-medium">Last stock update:</span>{" "}
          {fmtDateTime(response.meta.last_stock_update)}
        </p>
        <p>
          <span className="font-medium">Stock semantics:</span> {response.meta.stock_semantics}
        </p>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Replenishment list (top 20)</h2>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-600">No rows for selected period.</p>
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
                {rows.map((row) => (
                  <tr key={row.ozon_product_id} className="border-b align-top">
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
      </section>
    </main>
  );
}
