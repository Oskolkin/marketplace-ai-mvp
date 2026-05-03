"use client";

import { Fragment, useEffect, useState } from "react";
import {
  dismissAlert,
  getAlerts,
  getAlertsSummary,
  resolveAlert,
  runAlerts,
  type AlertEntityType,
  type AlertGroup,
  type AlertItem,
  type AlertSeverity,
  type AlertsSummaryResponse,
  type AlertStatus,
} from "@/lib/alerts-api";

type FilterState = {
  status: "" | AlertStatus;
  group: "" | AlertGroup;
  severity: "" | AlertSeverity;
  entityType: "" | AlertEntityType;
  limit: number;
  offset: number;
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtEntity(row: AlertItem): string {
  if (row.entity_sku != null) return `SKU ${row.entity_sku}`;
  if (row.entity_offer_id) return `Offer ${row.entity_offer_id}`;
  if (row.entity_id) return row.entity_id;
  return row.entity_type;
}

export default function AlertsScreen() {
  const [summary, setSummary] = useState<AlertsSummaryResponse | null>(null);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [filters, setFilters] = useState<FilterState>({
    status: "",
    group: "",
    severity: "",
    entityType: "",
    limit: 50,
    offset: 0,
  });

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [runAsOfDate, setRunAsOfDate] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function reloadSummary() {
    try {
      setLoadingSummary(true);
      const data = await getAlertsSummary();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts summary");
    } finally {
      setLoadingSummary(false);
    }
  }

  async function reloadList() {
    try {
      setLoadingList(true);
      const data = await getAlerts({
        status: filters.status || undefined,
        group: filters.group || undefined,
        severity: filters.severity || undefined,
        entityType: filters.entityType || undefined,
        limit: filters.limit,
        offset: filters.offset,
      });
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    setError("");
    void reloadSummary();
    void reloadList();
    // list depends on all filter values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.group, filters.severity, filters.entityType, filters.limit, filters.offset]);

  async function handleRun() {
    try {
      setRunning(true);
      setError("");
      setStatusMessage("");
      await runAlerts(runAsOfDate ? { as_of_date: runAsOfDate } : undefined);
      setStatusMessage("Alerts engine run completed.");
      await Promise.all([reloadSummary(), reloadList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run alerts");
    } finally {
      setRunning(false);
    }
  }

  async function handleDismiss(id: number) {
    try {
      setActionLoadingId(id);
      setError("");
      setStatusMessage("");
      await dismissAlert(id);
      setStatusMessage(`Alert ${id} dismissed.`);
      await Promise.all([reloadSummary(), reloadList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss alert");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleResolve(id: number) {
    try {
      setActionLoadingId(id);
      setError("");
      setStatusMessage("");
      await resolveAlert(id);
      setStatusMessage(`Alert ${id} resolved.`);
      await Promise.all([reloadSummary(), reloadList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve alert");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alerts</h1>
          <p className="text-sm text-gray-600">Summary, filters, evidence and manual run controls.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">as_of_date (optional)</span>
            <input
              type="date"
              className="rounded border px-2 py-1"
              value={runAsOfDate}
              onChange={(e) => setRunAsOfDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="rounded border px-3 py-2 hover:bg-gray-50"
          >
            {running ? "Running..." : "Run alerts manually"}
          </button>
        </div>
      </div>

      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      {statusMessage ? (
        <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">{statusMessage}</p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {loadingSummary || !summary ? (
          <div className="col-span-full rounded border p-4 text-sm">Loading summary...</div>
        ) : (
          <>
            <SummaryCard label="Open alerts" value={summary.open_total} />
            <SummaryCard label="Critical" value={summary.critical_count} />
            <SummaryCard label="High" value={summary.high_count} />
            <SummaryCard label="Medium" value={summary.medium_count} />
            <SummaryCard label="Low" value={summary.low_count} />
            <SummaryCard label="Sales" value={summary.by_group.sales} />
            <SummaryCard label="Stock" value={summary.by_group.stock} />
            <SummaryCard label="Advertising" value={summary.by_group.advertising} />
            <SummaryCard label="Price/Economics" value={summary.by_group.price_economics} />
          </>
        )}
      </section>

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">Latest run</h2>
        {loadingSummary || !summary ? (
          <p>Loading latest run...</p>
        ) : !summary.latest_run ? (
          <p className="text-gray-600">No runs yet.</p>
        ) : (
          <div className="space-y-1">
            <p>
              status=<b>{summary.latest_run.status}</b>, run_type={summary.latest_run.run_type}
            </p>
            <p>started_at={fmtDate(summary.latest_run.started_at)}</p>
            <p>finished_at={fmtDate(summary.latest_run.finished_at)}</p>
            <p>total_alerts_count={summary.latest_run.total_alerts_count}</p>
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Filters</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters((s) => ({ ...s, status: v as FilterState["status"], offset: 0 }))}
            options={[
              ["", "all"],
              ["open", "open"],
              ["resolved", "resolved"],
              ["dismissed", "dismissed"],
            ]}
          />
          <Select
            label="Group"
            value={filters.group}
            onChange={(v) => setFilters((s) => ({ ...s, group: v as FilterState["group"], offset: 0 }))}
            options={[
              ["", "all"],
              ["sales", "sales"],
              ["stock", "stock"],
              ["advertising", "advertising"],
              ["price_economics", "price_economics"],
            ]}
          />
          <Select
            label="Severity"
            value={filters.severity}
            onChange={(v) => setFilters((s) => ({ ...s, severity: v as FilterState["severity"], offset: 0 }))}
            options={[
              ["", "all"],
              ["low", "low"],
              ["medium", "medium"],
              ["high", "high"],
              ["critical", "critical"],
            ]}
          />
          <Select
            label="Entity type"
            value={filters.entityType}
            onChange={(v) => setFilters((s) => ({ ...s, entityType: v as FilterState["entityType"], offset: 0 }))}
            options={[
              ["", "all"],
              ["account", "account"],
              ["sku", "sku"],
              ["product", "product"],
              ["campaign", "campaign"],
              ["pricing_constraint", "pricing_constraint"],
            ]}
          />
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">Limit</span>
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              min={1}
              max={200}
              value={filters.limit}
              onChange={(e) =>
                setFilters((s) => ({
                  ...s,
                  limit: Math.max(1, Math.min(200, Number(e.target.value) || 50)),
                  offset: 0,
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Alerts list</h2>
        {loadingList ? (
          <p className="text-sm">Loading alerts...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-600">No alerts found for current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Severity</th>
                  <th className="px-2 py-2">Urgency</th>
                  <th className="px-2 py-2">Group</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Entity</th>
                  <th className="px-2 py-2">Message</th>
                  <th className="px-2 py-2">Last seen</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <Fragment key={row.id}>
                    <tr key={row.id} className="border-b align-top">
                      <td className="px-2 py-2">
                        <Badge label={row.severity} />
                      </td>
                      <td className="px-2 py-2">
                        <Badge label={row.urgency} />
                      </td>
                      <td className="px-2 py-2">{row.alert_group}</td>
                      <td className="px-2 py-2 font-medium">{row.title}</td>
                      <td className="px-2 py-2">{fmtEntity(row)}</td>
                      <td className="px-2 py-2">{row.message}</td>
                      <td className="px-2 py-2">{fmtDate(row.last_seen_at)}</td>
                      <td className="px-2 py-2">{row.status}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            className="rounded border px-2 py-1 hover:bg-gray-50"
                            onClick={() => handleDismiss(row.id)}
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            className="rounded border px-2 py-1 hover:bg-gray-50"
                            onClick={() => handleResolve(row.id)}
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 hover:bg-gray-50"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [row.id]: !prev[row.id],
                              }))
                            }
                          >
                            {expanded[row.id] ? "Hide evidence" : "Show evidence"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded[row.id] ? (
                      <tr className="border-b">
                        <td colSpan={9} className="bg-gray-50 px-2 py-2">
                          <p className="mb-2 text-xs text-gray-600">
                            metric={String(row.evidence_payload?.metric ?? "—")}
                          </p>
                          {row.evidence_payload && Object.keys(row.evidence_payload).length > 0 ? (
                            <pre className="overflow-x-auto rounded border bg-white p-2 text-xs">
                              {JSON.stringify(row.evidence_payload, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-gray-600">No evidence payload.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={filters.offset === 0 || loadingList}
            className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            onClick={() =>
              setFilters((s) => ({
                ...s,
                offset: Math.max(0, s.offset - s.limit),
              }))
            }
          >
            Prev
          </button>
          <button
            type="button"
            disabled={loadingList || items.length < filters.limit}
            className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            onClick={() =>
              setFilters((s) => ({
                ...s,
                offset: s.offset + s.limit,
              }))
            }
          >
            Next
          </button>
          <span className="text-sm text-gray-600">offset={filters.offset}, limit={filters.limit}</span>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded border p-3">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </article>
  );
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
  options: [string, string][];
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-gray-700">{label}</span>
      <select className="w-full rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v || "all"} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="inline-flex rounded border px-2 py-0.5 text-xs">{label}</span>;
}
