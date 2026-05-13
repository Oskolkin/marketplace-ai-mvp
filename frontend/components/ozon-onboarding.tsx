"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

  const hasConnection = !!connection;
  const isConnectionValid =
    syncStatus?.connection_status === "valid" || connection?.status === "valid";

  const currentSyncStatus = syncStatus?.current_sync?.status ?? null;
  const syncInProgress = currentSyncStatus === "pending" || currentSyncStatus === "running";

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
    loadData();
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
      setSuccessMessage("Initial sync started");
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
    return <p>Loading Ozon onboarding...</p>;
  }

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {successMessage ? (
        <p className="text-sm text-green-600">{successMessage}</p>
      ) : null}

      <section className="rounded border p-4">
        <h2 className="mb-2 text-xl font-semibold">Ozon Seller API</h2>
        <p className="mb-4 text-sm text-gray-600">
          Enter your Ozon Seller API credentials (Client-Id and API key). The API key is never
          shown again after save.
        </p>

        <div className="mb-4 space-y-1 text-sm">
          <p>
            <span className="font-medium">Seller API status:</span> {connectionStatusLabel}
          </p>
          <p>
            <span className="font-medium">Performance API status:</span>{" "}
            {performanceStatusLabel}
          </p>
          <p>
            <span className="font-medium">Performance token:</span>{" "}
            {connection?.performance_token_set ? "Set (hidden)" : "Not set"}
          </p>
          <p>
            <span className="font-medium">Saved credentials:</span>{" "}
            {connection?.has_credentials ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium">Client ID:</span>{" "}
            {connection?.client_id_masked || "—"}
          </p>
          <p>
            <span className="font-medium">Seller last check:</span>{" "}
            {syncStatus?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium">Seller last error:</span>{" "}
            {syncStatus?.last_error ?? connection?.last_error ?? "—"}
          </p>
          <p>
            <span className="font-medium">Performance last check:</span>{" "}
            {syncStatus?.performance_last_check_result ??
              connection?.performance_last_check_result ??
              "—"}
          </p>
          <p>
            <span className="font-medium">Performance last error:</span>{" "}
            {syncStatus?.performance_last_error ??
              connection?.performance_last_error ??
              "—"}
          </p>
          <p>
            <span className="font-medium">Last successful update:</span>{" "}
            {syncStatus?.last_successful_sync_at ?? "—"}
          </p>
          {latestAdsImportError ? (
            <p className="text-amber-800">
              <span className="font-medium">Latest ads import error:</span>{" "}
              {latestAdsImportError}
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Client ID</label>
            <input
              className="w-full rounded border px-3 py-2"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={hasConnection ? "Enter new Client ID" : "Enter Client ID"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">API key</label>
            <input
              className="w-full rounded border px-3 py-2"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasConnection ? "Enter new API key" : "Enter API key"}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : hasConnection
                ? "Update connection"
                : "Save connection"}
            </button>

            <button
              type="button"
              disabled={!connection || checking}
              onClick={handleCheck}
              className="rounded border px-4 py-2 disabled:opacity-50"
            >
              {checking ? "Checking..." : "Check Seller API"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-2 text-xl font-semibold">Ozon Performance API</h2>
        <p className="mb-4 text-sm text-gray-600">
          Bearer token for Ozon Performance API — needed only for advertising analytics sync. It
          is separate from the Seller API key, stored encrypted, and never shown after save.
        </p>

        <form onSubmit={handleSavePerformance} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Performance API bearer token</label>
            <input
              className="w-full rounded border px-3 py-2"
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
            <button
              type="submit"
              disabled={!hasConnection || savingPerf}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {savingPerf ? "Saving..." : "Save performance token"}
            </button>
            <button
              type="button"
              disabled={!hasConnection || savingPerf || !connection?.performance_token_set}
              onClick={handleClearPerformance}
              className="rounded border px-4 py-2 disabled:opacity-50"
            >
              Remove token
            </button>
            <button
              type="button"
              disabled={!hasConnection || checkingPerf}
              onClick={handleCheckPerformance}
              className="rounded border px-4 py-2 disabled:opacity-50"
            >
              {checkingPerf ? "Checking..." : "Check Performance API"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-2 text-xl font-semibold">Initial onboarding sync</h2>
        <p className="mb-4 text-sm text-gray-600">
          After successful connection check, start the initial synchronization workflow.
        </p>

        <div className="mb-4 space-y-1 text-sm">
          <p>
            <span className="font-medium">Initial sync status:</span>{" "}
            {initialSyncLabel}
          </p>
          <p>
            <span className="font-medium">Last sync error:</span>{" "}
            {syncStatus?.current_sync?.error_message ?? "—"}
          </p>
          <p>
            <span className="font-medium">Current sync type:</span>{" "}
            {syncStatus?.current_sync?.type ?? "—"}
          </p>
          <p>
            <span className="font-medium">Current sync started at:</span>{" "}
            {syncStatus?.current_sync?.started_at ?? "—"}
          </p>
          <p>
            <span className="font-medium">Current sync finished at:</span>{" "}
            {syncStatus?.current_sync?.finished_at ?? "—"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!isConnectionValid || syncInProgress || startingSync}
            onClick={handleInitialSync}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {startingSync ? "Starting..." : "Start initial sync"}
          </button>

          <button
            type="button"
            onClick={handleRefreshStatus}
            className="rounded border px-4 py-2"
          >
            Refresh status
          </button>
        </div>

        {!isConnectionValid ? (
          <p className="mt-3 text-sm text-gray-600">
            Initial sync is available only after a successful connection check.
          </p>
        ) : null}
      </section>
    </div>
  );
}