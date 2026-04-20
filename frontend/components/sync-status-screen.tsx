"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getOzonConnection,
  getOzonIngestionStatus,
  startInitialSync,
  type GetOzonConnectionResponse,
  type OzonIngestionStatusResponse,
} from "@/lib/ozon-api";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function sortImportJobsByDomain(status: OzonIngestionStatusResponse | null) {
  if (!status) return [];

  const domainOrder = ["products", "orders", "stocks", "ads"];
  return [...status.latest_import_jobs].sort((a, b) => {
    return domainOrder.indexOf(a.domain) - domainOrder.indexOf(b.domain);
  });
}

export default function SyncStatusScreen() {
  const [connection, setConnection] = useState<GetOzonConnectionResponse["connection"]>(null);
  const [status, setStatus] = useState<OzonIngestionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingSync, setStartingSync] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const importJobs = useMemo(() => sortImportJobsByDomain(status), [status]);

  async function loadData() {
    const [connectionRes, statusRes] = await Promise.all([
      getOzonConnection(),
      getOzonIngestionStatus(),
    ]);

    setConnection(connectionRes.connection);
    setStatus(statusRes);
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sync status");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  async function handleRefresh() {
    try {
      setRefreshing(true);
      setError("");
      setSuccessMessage("");
      await loadData();
      setSuccessMessage("Status refreshed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh sync status");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStartSync() {
    try {
      setStartingSync(true);
      setError("");
      setSuccessMessage("");

      await startInitialSync();
      await loadData();

      setSuccessMessage("Sync started");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start sync");
    } finally {
      setStartingSync(false);
    }
  }

  if (loading) {
    return <p>Loading sync status...</p>;
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sync status</h1>
          <p className="text-sm text-gray-600">
            Technical ingestion status for Ozon connection and latest import jobs.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded border px-4 py-2 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={handleStartSync}
            disabled={startingSync || !connection}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {startingSync ? "Starting..." : "Start sync"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {successMessage ? <p className="text-sm text-green-600">{successMessage}</p> : null}

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Connection</h2>
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Connection status:</span>{" "}
            {status?.connection_status ?? connection?.status ?? "—"}
          </p>
          <p>
            <span className="font-medium">Client ID:</span>{" "}
            {connection?.client_id_masked || "—"}
          </p>
          <p>
            <span className="font-medium">Last check at:</span>{" "}
            {formatDateTime(status?.last_check_at ?? connection?.last_check_at)}
          </p>
          <p>
            <span className="font-medium">Last check result:</span>{" "}
            {status?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium">Last connection error:</span>{" "}
            {status?.last_error ?? connection?.last_error ?? "—"}
          </p>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Sync summary</h2>
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Current sync status:</span>{" "}
            {status?.current_sync?.status ?? "—"}
          </p>
          <p>
            <span className="font-medium">Current sync type:</span>{" "}
            {status?.current_sync?.type ?? "—"}
          </p>
          <p>
            <span className="font-medium">Current sync started at:</span>{" "}
            {formatDateTime(status?.current_sync?.started_at)}
          </p>
          <p>
            <span className="font-medium">Current sync finished at:</span>{" "}
            {formatDateTime(status?.current_sync?.finished_at)}
          </p>
          <p>
            <span className="font-medium">Last successful update:</span>{" "}
            {formatDateTime(status?.last_successful_sync_at)}
          </p>
          <p>
            <span className="font-medium">Last sync error:</span>{" "}
            {status?.current_sync?.error_message ?? "—"}
          </p>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Latest import jobs by domain</h2>

        {importJobs.length === 0 ? (
          <p className="text-sm text-gray-600">No import jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Domain</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Source cursor</th>
                  <th className="px-2 py-2">Received</th>
                  <th className="px-2 py-2">Imported</th>
                  <th className="px-2 py-2">Failed</th>
                  <th className="px-2 py-2">Started</th>
                  <th className="px-2 py-2">Finished</th>
                  <th className="px-2 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {importJobs.map((job) => (
                  <tr key={job.id} className="border-b align-top">
                    <td className="px-2 py-2 font-medium">{job.domain}</td>
                    <td className="px-2 py-2">{job.status}</td>
                    <td className="px-2 py-2">{job.source_cursor ?? "—"}</td>
                    <td className="px-2 py-2">{job.records_received}</td>
                    <td className="px-2 py-2">{job.records_imported}</td>
                    <td className="px-2 py-2">{job.records_failed}</td>
                    <td className="px-2 py-2">{formatDateTime(job.started_at)}</td>
                    <td className="px-2 py-2">{formatDateTime(job.finished_at)}</td>
                    <td className="px-2 py-2">{job.error_message ?? "—"}</td>
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