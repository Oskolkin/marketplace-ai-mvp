"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAdminClients, getAdminMe, type AdminClientListItem } from "@/lib/admin-api";

const PAGE_LIMIT = 50;

export default function AdminScreen() {
  const [adminReady, setAdminReady] = useState<"loading" | "allowed" | "forbidden" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AdminClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sellerStatus, setSellerStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [billingStatus, setBillingStatus] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getAdminMe()
      .then(() => {
        if (!cancelled) setAdminReady("allowed");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof Error && e.message.toLowerCase().includes("forbidden")) {
          setAdminReady("forbidden");
          return;
        }
        setAdminReady("error");
        setError(e instanceof Error ? e.message : "Failed to check admin access");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (adminReady !== "allowed") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    void getAdminClients({
      search: search || undefined,
      status: sellerStatus || undefined,
      connection_status: connectionStatus || undefined,
      limit: PAGE_LIMIT,
      offset,
    })
      .then((res) => setItems(res.items ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load clients"))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [adminReady, search, sellerStatus, connectionStatus, offset]);

  const visibleItems = useMemo(() => {
    if (!billingStatus) return items;
    return items.filter((it) => (it.billing_status ?? "") === billingStatus);
  }, [items, billingStatus]);

  if (adminReady === "loading") return <main className="p-6 text-sm">Checking admin access...</main>;
  if (adminReady === "forbidden") return <main className="p-6 text-sm text-red-700">Admin access required.</main>;
  if (adminReady === "error") return <main className="p-6 text-sm text-red-700">{error ?? "Admin check failed."}</main>;

  return (
    <main className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin / Support</h1>
        <p className="mt-1 text-sm text-gray-600">Internal support tooling for client diagnostics.</p>
      </header>

      <section className="rounded border bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">Search</span>
            <input
              className="w-full rounded border px-2 py-1"
              value={search}
              onChange={(e) => {
                setOffset(0);
                setSearch(e.target.value);
              }}
              placeholder="Seller or owner email"
            />
          </label>
          <Select
            label="Seller status"
            value={sellerStatus}
            onChange={(v) => {
              setOffset(0);
              setSellerStatus(v);
            }}
            options={[
              ["", "all"],
              ["active", "active"],
              ["disabled", "disabled"],
              ["suspended", "suspended"],
            ]}
          />
          <Select
            label="Connection status"
            value={connectionStatus}
            onChange={(v) => {
              setOffset(0);
              setConnectionStatus(v);
            }}
            options={[
              ["", "all"],
              ["valid", "valid"],
              ["invalid", "invalid"],
              ["missing", "missing"],
              ["error", "error"],
              ["unknown", "unknown"],
            ]}
          />
          <Select
            label="Billing status"
            value={billingStatus}
            onChange={(v) => setBillingStatus(v)}
            options={[
              ["", "all (client-side)"],
              ["trial", "trial"],
              ["active", "active"],
              ["past_due", "past_due"],
              ["paused", "paused"],
              ["cancelled", "cancelled"],
              ["internal", "internal"],
            ]}
          />
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setOffset(0);
                setSearch("");
                setSellerStatus("");
                setConnectionStatus("");
                setBillingStatus("");
              }}
            >
              Reset filters
            </button>
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
        {loading ? (
          <p className="text-sm">Loading clients...</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-gray-600">No clients found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Seller</th>
                  <th className="px-2 py-2">Owner email</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Connection</th>
                  <th className="px-2 py-2">Latest sync</th>
                  <th className="px-2 py-2">Open alerts</th>
                  <th className="px-2 py-2">Open recommendations</th>
                  <th className="px-2 py-2">Latest AI status</th>
                  <th className="px-2 py-2">Billing</th>
                  <th className="px-2 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => (
                  <tr key={row.seller_account_id} className="border-b">
                    <td className="px-2 py-2 font-medium">
                      <Link className="text-blue-700 underline" href={`/app/admin/clients/${row.seller_account_id}`}>
                        {row.seller_name} #{row.seller_account_id}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{row.user_email}</td>
                    <td className="px-2 py-2">
                      <StatusBadge value={row.seller_status} />
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge value={row.connection_status ?? "missing"} />
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge value={row.latest_sync_status ?? "unknown"} />
                    </td>
                    <td className="px-2 py-2">{row.open_alerts_count}</td>
                    <td className="px-2 py-2">{row.open_recommendations_count}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <StatusBadge value={row.latest_recommendation_run_status ?? "—"} />
                        <StatusBadge value={row.latest_chat_trace_status ?? "—"} />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge value={row.billing_status ?? "—"} />
                    </td>
                    <td className="px-2 py-2">{fmtDate(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setOffset((v) => Math.max(0, v - PAGE_LIMIT))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={loading || items.length < PAGE_LIMIT}
            className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setOffset((v) => v + PAGE_LIMIT)}
          >
            Next
          </button>
          <span className="text-xs text-gray-600">offset={offset}, limit={PAGE_LIMIT}</span>
        </div>
      </section>
    </main>
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-gray-700">{label}</span>
      <select className="w-full rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v || "all"} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  let cls = "border-gray-300 bg-gray-100 text-gray-700";
  if (["completed", "valid", "active", "trial", "open"].includes(v)) cls = "border-green-300 bg-green-50 text-green-700";
  if (["running", "pending"].includes(v)) cls = "border-blue-300 bg-blue-50 text-blue-700";
  if (["failed", "error", "invalid", "past_due"].includes(v)) cls = "border-red-300 bg-red-50 text-red-700";
  if (["internal", "missing", "unknown", "—"].includes(v)) cls = "border-yellow-300 bg-yellow-50 text-yellow-700";
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${cls}`}>{value}</span>;
}
