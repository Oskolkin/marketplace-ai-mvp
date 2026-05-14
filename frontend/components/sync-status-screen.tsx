"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminMe } from "@/lib/admin-api";
import { Button, buttonClassNames } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/components/ui/cn";
import {
  getOzonConnection,
  getOzonIngestionStatus,
  startInitialSync,
  type GetOzonConnectionResponse,
  type OzonIngestionStatusResponse,
} from "@/lib/ozon-api";
import { mapPerformanceConnectionStatus } from "@/lib/ozon-ui";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function sortImportJobsByDomain(status: OzonIngestionStatusResponse | null) {
  if (!status) return [];

  const domainOrder = ["products", "orders", "sales", "stocks", "ads"];
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
  const [autoRefresh, setAutoRefresh] = useState(false);
  /** "pending" = getAdminMe not settled yet; only "show" renders /app/admin link */
  const [adminNavLink, setAdminNavLink] = useState<"pending" | "show" | "hide">("pending");

  const importJobs = useMemo(() => sortImportJobsByDomain(status), [status]);

  const failedImportJob = useMemo(() => {
    const failed = importJobs.filter((j) => j.status === "failed" && j.error_message);
    if (failed.length === 0) return null;
    return failed[failed.length - 1];
  }, [importJobs]);

  const syncIsRunning =
    status?.current_sync?.status === "running" || status?.current_sync?.status === "pending";

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setRefreshing(true);
    }
    try {
      const [connectionRes, statusRes] = await Promise.all([
        getOzonConnection(),
        getOzonIngestionStatus(),
      ]);

      setConnection(connectionRes.connection);
      setStatus(statusRes);
    } finally {
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        await loadData({ silent: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sync status");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    void getAdminMe()
      .then((r) => {
        if (cancelled) return;
        setAdminNavLink(r.is_admin ? "show" : "hide");
      })
      .catch(() => {
        if (!cancelled) {
          /* non-admin or network: ignore error, treat as no admin link */
          setAdminNavLink("hide");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => {
      void loadData({ silent: true }).catch(() => {
        /* keep last good state */
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadData]);

  async function handleRefresh() {
    try {
      setError("");
      setSuccessMessage("");
      await loadData({ silent: false });
      setSuccessMessage("Status refreshed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh sync status");
    }
  }

  async function handleStartSync() {
    try {
      setStartingSync(true);
      setError("");
      setSuccessMessage("");

      await startInitialSync();
      await loadData({ silent: true });

      setSuccessMessage("Initial sync started");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start sync");
    } finally {
      setStartingSync(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <LoadingState message="Loading sync status…" />
      </main>
    );
  }

  if (!connection) {
    return (
      <main className="space-y-6 p-6">
        <PageHeader
          title="Sync status"
          subtitle="Technical ingestion status for Ozon connection and latest import jobs."
        />
        <EmptyState
          title="No Ozon connection"
          message="Connect Ozon Seller API on the integration page before you can run or monitor sync."
          action={
            <Link href="/app/integrations/ozon" className={buttonClassNames("primary")}>
              Open Ozon Integration
            </Link>
          }
        />
      </main>
    );
  }

  const connectionStatusRaw = status?.connection_status ?? connection?.status ?? "—";
  const syncStatusRaw = status?.current_sync?.status ?? "missing";
  const perfLabel = mapPerformanceConnectionStatus(
    status?.performance_connection_status ?? connection?.performance_status
  );

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Sync status"
        subtitle="Technical ingestion status for Ozon connection and latest import jobs."
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="size-4 rounded border-gray-300"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto refresh 5s
        </label>
        <Button type="button" variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleStartSync()}
          disabled={startingSync}
        >
          {startingSync ? "Starting…" : "Start initial sync"}
        </Button>
      </PageHeader>

      <p className="text-sm text-gray-600">
        After sync completes, metrics and alerts are recalculated automatically. Open the dashboard
        once you see a successful sync below.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
          Ozon Integration
        </Link>
        <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
          Dashboard
        </Link>
        {adminNavLink === "show" ? (
          <Link href="/app/admin" className={buttonClassNames("secondary")}>
            Admin / Support
          </Link>
        ) : null}
      </div>

      {error ? <ErrorState title="Could not complete action" message={error} /> : null}
      {successMessage ? (
        <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
      ) : null}

      {failedImportJob ? (
        <Card className="border-amber-300 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Import job failed</CardTitle>
            <CardDescription>
              Domain <span className="font-medium">{failedImportJob.domain}</span> reported an error.
              Other domains may still complete; check the table below.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-amber-950">
            <p className="font-medium">Error</p>
            <p className="mt-1 whitespace-pre-wrap">{failedImportJob.error_message}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Performance API</CardTitle>
            {status?.performance_connection_status || connection?.performance_status ? (
              <StatusBadge
                status={String(status?.performance_connection_status ?? connection?.performance_status)}
                label={perfLabel}
              />
            ) : null}
          </div>
          <CardDescription>
            Used for advertising analytics import only. Seller catalog sync does not depend on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Token saved:</span>{" "}
            {status?.performance_token_set ?? connection?.performance_token_set ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last check at:</span>{" "}
            {formatDateTime(status?.performance_last_check_at ?? connection?.performance_last_check_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last check result:</span>{" "}
            {status?.performance_last_check_result ?? connection?.performance_last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last error:</span>{" "}
            {status?.performance_last_error ?? connection?.performance_last_error ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Connection</CardTitle>
            {connectionStatusRaw !== "—" ? (
              <StatusBadge status={String(connectionStatusRaw)} label={String(connectionStatusRaw)} />
            ) : null}
          </div>
          <CardDescription>Last check and credential health for the Ozon seller API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Connection status:</span>{" "}
            {connectionStatusRaw}
          </p>
          <p>
            <span className="font-medium text-gray-900">Client ID:</span>{" "}
            {connection?.client_id_masked || "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last check at:</span>{" "}
            {formatDateTime(status?.last_check_at ?? connection?.last_check_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last check result:</span>{" "}
            {status?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last connection error:</span>{" "}
            {status?.last_error ?? connection?.last_error ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          syncIsRunning && "ring-2 ring-sky-400 ring-offset-2 ring-offset-gray-50",
        )}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Sync summary</CardTitle>
            {syncIsRunning ? (
              <StatusBadge status="running" label="Running" />
            ) : syncStatusRaw !== "missing" ? (
              <StatusBadge status={String(syncStatusRaw)} label={String(syncStatusRaw)} />
            ) : (
              <StatusBadge status="missing" label="No active job" />
            )}
          </div>
          <CardDescription>Current job and last successful full sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Current sync type:</span>{" "}
            {status?.current_sync?.type ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Current sync started at:</span>{" "}
            {formatDateTime(status?.current_sync?.started_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Current sync finished at:</span>{" "}
            {formatDateTime(status?.current_sync?.finished_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last successful update:</span>{" "}
            {formatDateTime(status?.last_successful_sync_at)}
          </p>
          {!status?.last_successful_sync_at ? (
            <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-amber-950">
              No successful full sync yet — the dashboard may stay empty until ingestion completes.
              Use &quot;Start initial sync&quot; from this page or Ozon Integration if you have not
              started one.
            </p>
          ) : null}
          <p>
            <span className="font-medium text-gray-900">Last sync error:</span>{" "}
            {status?.current_sync?.error_message ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest import jobs by domain</CardTitle>
          <CardDescription>Per-domain import progress for the latest sync.</CardDescription>
        </CardHeader>
        <CardContent>
          {importJobs.length === 0 ? (
            <EmptyState
              title="No import jobs yet"
              message="Start initial sync first — import rows appear here while products, orders, stocks, and ads are pulled from Ozon."
              action={
                <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
                  Open Ozon Integration
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-2 py-2 font-medium text-gray-700">Domain</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Status</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Source cursor</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Received</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Imported</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Failed</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Started</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Finished</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {importJobs.map((job) => (
                    <tr key={job.id} className="border-b border-gray-100 align-top">
                      <td className="px-2 py-2 font-medium text-gray-900">{job.domain}</td>
                      <td className="px-2 py-2">
                        <StatusBadge status={job.status} label={job.status} />
                      </td>
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
        </CardContent>
      </Card>
    </main>
  );
}
