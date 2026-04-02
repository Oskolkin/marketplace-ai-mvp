"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  checkOzonConnection,
  createOzonConnection,
  getOzonConnection,
  getOzonSyncStatus,
  startInitialSync,
  updateOzonConnection,
  type OzonConnectionDto,
  type OzonSyncStatusResponse,
} from "@/lib/ozon-api";
import { mapConnectionStatus, mapSyncStatus } from "@/lib/ozon-ui";

export default function OzonOnboarding() {
  const [connection, setConnection] = useState<OzonConnectionDto | null>(null);
  const [syncStatus, setSyncStatus] = useState<OzonSyncStatusResponse | null>(null);

  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [startingSync, setStartingSync] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const hasConnection = !!connection;
  const isConnectionValid = syncStatus?.connection_status === "valid" || connection?.status === "valid";
  const syncInProgress =
    syncStatus?.initial_sync_status === "pending" ||
    syncStatus?.initial_sync_status === "running";

  const connectionStatusLabel = useMemo(() => {
    return mapConnectionStatus(syncStatus?.connection_status ?? connection?.status);
  }, [connection, syncStatus]);

  const initialSyncLabel = useMemo(() => {
    return mapSyncStatus(syncStatus?.initial_sync_status);
  }, [syncStatus]);

  async function loadData() {
    setError("");

    try {
      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonSyncStatus().catch(() => null),
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
            client_id: clientId,
            api_key: apiKey,
          })
        : await createOzonConnection({
            client_id: clientId,
            api_key: apiKey,
          });

      setConnection(response.connection);
      setApiKey("");
      setSuccessMessage(hasConnection ? "Connection updated" : "Connection saved");

      const syncRes = await getOzonSyncStatus().catch(() => null);
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
        getOzonSyncStatus(),
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

  async function handleInitialSync() {
    setError("");
    setSuccessMessage("");

    try {
      setStartingSync(true);

      await startInitialSync();

      const [connectionRes, syncRes] = await Promise.all([
        getOzonConnection(),
        getOzonSyncStatus(),
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
        getOzonSyncStatus(),
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
      <section className="rounded border p-4">
        <h2 className="mb-2 text-xl font-semibold">Ozon connection</h2>
        <p className="mb-4 text-sm text-gray-600">
          Enter your Ozon Seller API credentials. API key is never shown again after save.
        </p>

        <div className="mb-4 space-y-1 text-sm">
          <p>
            <span className="font-medium">Connection status:</span>{" "}
            {connectionStatusLabel}
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
            <span className="font-medium">Last check result:</span>{" "}
            {syncStatus?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium">Last error:</span>{" "}
            {syncStatus?.last_error ?? connection?.last_error ?? "—"}
          </p>
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

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {successMessage ? (
            <p className="text-sm text-green-600">{successMessage}</p>
          ) : null}

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
              {checking ? "Checking..." : "Check connection"}
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
            {syncStatus?.last_sync_error ?? "—"}
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