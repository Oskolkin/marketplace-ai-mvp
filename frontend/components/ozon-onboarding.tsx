"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassNames } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  checkOzonConnection,
  checkOzonPerformanceConnection,
  createOzonConnection,
  getOzonConnection,
  getOzonIngestionStatus,
  putOzonPerformanceToken,
  startInitialSync,
  updateOzonConnection,
  type OzonConnectionDto,
  type OzonIngestionStatusResponse,
} from "@/lib/ozon-api";
import {
  mapConnectionStatus,
  mapPerformanceConnectionStatus,
  mapSyncStatus,
} from "@/lib/ozon-ui";

type SellerReadiness = "connected" | "missing" | "error";
type PerformanceReadiness = "set" | "missing" | "error";

function sellerReadinessState(
  connection: OzonConnectionDto | null,
  syncStatus: OzonIngestionStatusResponse | null
): SellerReadiness {
  if (!connection) return "missing";
  const st = syncStatus?.connection_status ?? connection.status;
  if (st === "invalid" || connection.last_error || syncStatus?.last_error) return "error";
  if (st === "valid" || st === "sync_pending" || st === "sync_in_progress") return "connected";
  if (connection.has_credentials) return "missing";
  return "missing";
}

function performanceReadinessState(
  connection: OzonConnectionDto | null,
  syncStatus: OzonIngestionStatusResponse | null
): PerformanceReadiness {
  const tokenSet = connection?.performance_token_set ?? syncStatus?.performance_token_set ?? false;
  const perfSt = connection?.performance_status ?? syncStatus?.performance_connection_status;
  if (perfSt === "invalid" || connection?.performance_last_error || syncStatus?.performance_last_error) {
    return "error";
  }
  if (tokenSet && perfSt === "valid") return "set";
  if (tokenSet) return "set";
  return "missing";
}

export default function OzonOnboarding() {
  const [connection, setConnection] = useState<OzonConnectionDto | null>(null);
  const [syncStatus, setSyncStatus] = useState<OzonIngestionStatusResponse | null>(null);

  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [performanceToken, setPerformanceToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [savingPerf, setSavingPerf] = useState(false);
  const [checkingPerf, setCheckingPerf] = useState(false);
  const [startingSync, setStartingSync] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [credentialsJustSaved, setCredentialsJustSaved] = useState(false);

  const hasConnection = !!connection;
  const isConnectionValid =
    syncStatus?.connection_status === "valid" || connection?.status === "valid";

  const currentSyncStatus = syncStatus?.current_sync?.status ?? null;
  const syncInProgress = currentSyncStatus === "pending" || currentSyncStatus === "running";

  const sellerReady = useMemo(
    () => sellerReadinessState(connection, syncStatus),
    [connection, syncStatus]
  );
  const performanceReady = useMemo(
    () => performanceReadinessState(connection, syncStatus),
    [connection, syncStatus]
  );

  const connectionStatusLabel = useMemo(() => {
    return mapConnectionStatus(syncStatus?.connection_status ?? connection?.status);
  }, [connection, syncStatus]);

  const performanceStatusLabel = useMemo(() => {
    return mapPerformanceConnectionStatus(
      syncStatus?.performance_connection_status ?? connection?.performance_status
    );
  }, [connection, syncStatus]);

  const latestAdsImportError = useMemo(() => {
    const jobs = syncStatus?.latest_import_jobs ?? [];
    for (const j of jobs) {
      if (j.domain === "ads" && j.status === "failed" && j.error_message) {
        return j.error_message;
      }
    }
    return null;
  }, [syncStatus]);

  const initialSyncLabel = useMemo(() => {
    return mapSyncStatus(currentSyncStatus);
  }, [currentSyncStatus]);

  const hasSellerCredentials = Boolean(connection?.has_credentials);
  const showCheckSellerCallout = credentialsJustSaved && hasSellerCredentials && !isConnectionValid;
  const showStartInitialSyncCta = isConnectionValid && !syncInProgress;

  useEffect(() => {
    if (isConnectionValid) {
      setCredentialsJustSaved(false);
    }
  }, [isConnectionValid]);

  async function loadData() {
    setError("");

    try {
      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonIngestionStatus().catch(() => null),
      ]);

      setConnection(connectionRes.connection);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Ozon data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!clientId.trim() || !apiKey.trim()) {
      setError("Client ID and API key are required");
      return;
    }

    try {
      setSaving(true);

      const response = hasConnection
        ? await updateOzonConnection({
            client_id: clientId.trim(),
            api_key: apiKey.trim(),
          })
        : await createOzonConnection({
            client_id: clientId.trim(),
            api_key: apiKey.trim(),
            ...(performanceToken.trim()
              ? { performance_bearer_token: performanceToken.trim() }
              : {}),
          });

      setConnection(response.connection);
      setApiKey("");
      if (!hasConnection && performanceToken.trim()) {
        setPerformanceToken("");
      }
      setSuccessMessage(hasConnection ? "Connection updated" : "Connection saved");
      setCredentialsJustSaved(true);

      const syncRes = await getOzonIngestionStatus().catch(() => null);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Ozon connection");
    } finally {
      setSaving(false);
    }
  }

  async function handleCheck() {
    setError("");
    setSuccessMessage("");

    try {
      setChecking(true);

      await checkOzonConnection();

      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonIngestionStatus(),
      ]);

      setConnection(connectionRes.connection);
      setSyncStatus(syncRes);
      setSuccessMessage("Connection check completed");
      setCredentialsJustSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check Ozon connection");
    } finally {
      setChecking(false);
    }
  }

  async function handleSavePerformance(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!hasConnection) {
      setError("Save Ozon Seller API credentials first");
      return;
    }
    if (!performanceToken.trim()) {
      setError("Paste a Performance API token or use Remove token");
      return;
    }

    try {
      setSavingPerf(true);
      const response = await putOzonPerformanceToken({
        performance_bearer_token: performanceToken.trim(),
      });
      setConnection(response.connection);
      setPerformanceToken("");
      setSuccessMessage("Performance token saved");

      const syncRes = await getOzonIngestionStatus().catch(() => null);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save performance token");
    } finally {
      setSavingPerf(false);
    }
  }

  async function handleClearPerformance() {
    setError("");
    setSuccessMessage("");

    if (!hasConnection) {
      return;
    }

    try {
      setSavingPerf(true);
      const response = await putOzonPerformanceToken({
        clear_performance_token: true,
      });
      setConnection(response.connection);
      setPerformanceToken("");
      setSuccessMessage("Performance token removed");

      const syncRes = await getOzonIngestionStatus().catch(() => null);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove performance token");
    } finally {
      setSavingPerf(false);
    }
  }

  async function handleCheckPerformance() {
    setError("");
    setSuccessMessage("");

    if (!hasConnection) {
      setError("Save Ozon Seller API credentials first");
      return;
    }

    try {
      setCheckingPerf(true);
      await checkOzonPerformanceConnection();
      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonIngestionStatus(),
      ]);
      setConnection(connectionRes.connection);
      setSyncStatus(syncRes);
      setSuccessMessage("Performance connection check completed");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to check performance connection"
      );
    } finally {
      setCheckingPerf(false);
    }
  }

  async function handleInitialSync() {
    setError("");
    setSuccessMessage("");

    try {
      setStartingSync(true);

      await startInitialSync();

      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonIngestionStatus(),
      ]);

      setConnection(connectionRes.connection);
      setSyncStatus(syncRes);
      setSuccessMessage("Initial sync started — open Sync Status to watch import jobs.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start initial sync");
    } finally {
      setStartingSync(false);
    }
  }

  async function handleRefreshStatus() {
    setError("");

    try {
      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonIngestionStatus(),
      ]);

      setConnection(connectionRes.connection);
      setSyncStatus(syncRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh status");
    }
  }

  if (loading) {
    return (
      <div className="py-4">
        <LoadingState message="Loading Ozon onboarding…" />
      </div>
    );
  }

  const sellerBadgeStatus =
    sellerReady === "connected" ? "valid" : sellerReady === "error" ? "invalid" : "missing";
  const perfBadgeStatus =
    performanceReady === "set" ? "valid" : performanceReady === "error" ? "invalid" : "missing";
  const perfBadgeLabel =
    performanceReady === "set" ? "Token set" : performanceReady === "error" ? "Error" : "Token missing";

  return (
    <div className="space-y-8">
      {error ? <ErrorState title="Something went wrong" message={error} /> : null}
      {successMessage ? (
        <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Connection readiness</CardTitle>
          <CardDescription>
            Seller API is required for catalog and orders sync. Performance API is optional and
            only used for advertising analytics — you can run initial sync without it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Seller API</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={sellerBadgeStatus}
                label={sellerReady === "connected" ? "Connected" : sellerReady === "error" ? "Error" : "Missing"}
              />
            </div>
            <p className="mt-2 text-sm text-gray-600">{connectionStatusLabel}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Performance API
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={perfBadgeStatus} label={perfBadgeLabel} />
            </div>
            <p className="mt-2 text-sm text-gray-600">{performanceStatusLabel}</p>
            <p className="mt-2 text-xs text-gray-500">
              Needed only for ad analytics import. Does not block Seller API sync or dashboard
              metrics from catalog/orders/stocks.
            </p>
          </div>
        </CardContent>
      </Card>

      {performanceReady === "missing" && hasConnection ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-start gap-2">
              <Badge tone="warning">Performance token</Badge>
              <p className="text-sm text-amber-950">
                No Performance API token — advertising import may be skipped. Seller sync and core
                metrics still work. Add a token below when you want ad analytics.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showCheckSellerCallout ? (
        <Card className="border-sky-200 bg-sky-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Next step: verify Seller API</CardTitle>
            <CardDescription>
              Credentials are saved. Run a check so we can confirm access before starting sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="primary" disabled={checking} onClick={() => void handleCheck()}>
              {checking ? "Checking…" : "Check Seller API"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isConnectionValid ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Seller API is valid</CardTitle>
            <CardDescription>
              {syncInProgress
                ? "A sync job is already running or queued — use Sync Status to monitor progress."
                : "Start the initial import of products, orders, stocks, and ads."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={!showStartInitialSyncCta || startingSync}
              onClick={() => void handleInitialSync()}
            >
              {startingSync ? "Starting…" : "Start initial sync"}
            </Button>
            <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
              Open Sync Status
            </Link>
            {syncStatus?.last_successful_sync_at ? (
              <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
                Open Dashboard
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Ozon Seller API</h2>
        <p className="mb-4 text-sm text-gray-600">
          Enter your Ozon Seller API credentials (Client-Id and API key). The API key is never shown
          again after save.
        </p>

        <div className="mb-4 space-y-1 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Seller API status:</span> {connectionStatusLabel}
          </p>
          <p>
            <span className="font-medium text-gray-900">Performance API status:</span>{" "}
            {performanceStatusLabel}
          </p>
          <p>
            <span className="font-medium text-gray-900">Performance token:</span>{" "}
            {connection?.performance_token_set ? "Set (hidden)" : "Not set"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Saved credentials:</span>{" "}
            {connection?.has_credentials ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Client ID:</span>{" "}
            {connection?.client_id_masked || "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Seller last check:</span>{" "}
            {syncStatus?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Seller last error:</span>{" "}
            {syncStatus?.last_error ?? connection?.last_error ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Performance last check:</span>{" "}
            {syncStatus?.performance_last_check_result ??
              connection?.performance_last_check_result ??
              "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Performance last error:</span>{" "}
            {syncStatus?.performance_last_error ?? connection?.performance_last_error ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last successful update:</span>{" "}
            {syncStatus?.last_successful_sync_at ?? "—"}
          </p>
          {latestAdsImportError ? (
            <p className="text-amber-800">
              <span className="font-medium">Latest ads import error:</span> {latestAdsImportError}
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Client ID</label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={hasConnection ? "Enter new Client ID" : "Enter Client ID"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">API key</label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasConnection ? "Enter new API key" : "Enter API key"}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : hasConnection ? "Update connection" : "Save connection"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={!connection || checking}
              onClick={() => void handleCheck()}
            >
              {checking ? "Checking…" : "Check Seller API"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Ozon Performance API</h2>
        <p className="mb-4 text-sm text-gray-600">
          Bearer token for Ozon Performance API — used only for advertising analytics sync. It is
          separate from the Seller API key, stored encrypted, and never shown after save.
        </p>

        <form onSubmit={handleSavePerformance} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Performance API bearer token
            </label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              type="password"
              autoComplete="off"
              value={performanceToken}
              onChange={(e) => setPerformanceToken(e.target.value)}
              placeholder={
                connection?.performance_token_set
                  ? "Enter a new token to replace the saved one"
                  : "Paste Performance API bearer token"
              }
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={!hasConnection || savingPerf}>
              {savingPerf ? "Saving…" : "Save performance token"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasConnection || savingPerf || !connection?.performance_token_set}
              onClick={() => void handleClearPerformance()}
            >
              Remove token
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasConnection || checkingPerf}
              onClick={() => void handleCheckPerformance()}
            >
              {checkingPerf ? "Checking…" : "Check Performance API"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Initial onboarding sync</h2>
        <p className="mb-4 text-sm text-gray-600">
          After a successful Seller API check, start the initial synchronization. You can monitor
          import jobs on Sync Status.
        </p>

        <div className="mb-4 space-y-1 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Initial sync status:</span> {initialSyncLabel}
          </p>
          <p>
            <span className="font-medium text-gray-900">Last sync error:</span>{" "}
            {syncStatus?.current_sync?.error_message ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Current sync type:</span>{" "}
            {syncStatus?.current_sync?.type ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Current sync started at:</span>{" "}
            {syncStatus?.current_sync?.started_at ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Current sync finished at:</span>{" "}
            {syncStatus?.current_sync?.finished_at ?? "—"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            disabled={!isConnectionValid || syncInProgress || startingSync}
            onClick={() => void handleInitialSync()}
          >
            {startingSync ? "Starting…" : "Start initial sync"}
          </Button>

          <Button type="button" variant="secondary" onClick={() => void handleRefreshStatus()}>
            Refresh status
          </Button>
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Open Sync Status
          </Link>
        </div>

        {!isConnectionValid ? (
          <p className="mt-3 text-sm text-gray-600">
            Initial sync is available only after a successful Seller API check.
          </p>
        ) : null}
      </section>
    </div>
  );
}
