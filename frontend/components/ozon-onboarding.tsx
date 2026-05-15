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
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные Ozon");
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
      setError("Укажите Client ID и ключ API");
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
      setSuccessMessage(hasConnection ? "Подключение обновлено" : "Подключение сохранено");
      setCredentialsJustSaved(true);

      const syncRes = await getOzonIngestionStatus().catch(() => null);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить подключение Ozon");
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
      setSuccessMessage("Проверка подключения выполнена");
      setCredentialsJustSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось проверить подключение Ozon");
    } finally {
      setChecking(false);
    }
  }

  async function handleSavePerformance(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!hasConnection) {
      setError("Сначала сохраните учётные данные Ozon Seller API");
      return;
    }
    if (!performanceToken.trim()) {
      setError("Вставьте токен Performance API или нажмите «Удалить токен»");
      return;
    }

    try {
      setSavingPerf(true);
      const response = await putOzonPerformanceToken({
        performance_bearer_token: performanceToken.trim(),
      });
      setConnection(response.connection);
      setPerformanceToken("");
      setSuccessMessage("Токен Performance сохранён");

      const syncRes = await getOzonIngestionStatus().catch(() => null);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить токен Performance");
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
      setSuccessMessage("Токен Performance удалён");

      const syncRes = await getOzonIngestionStatus().catch(() => null);
      if (syncRes) {
        setSyncStatus(syncRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить токен Performance");
    } finally {
      setSavingPerf(false);
    }
  }

  async function handleCheckPerformance() {
    setError("");
    setSuccessMessage("");

    if (!hasConnection) {
      setError("Сначала сохраните учётные данные Ozon Seller API");
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
      setSuccessMessage("Проверка Performance API выполнена");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось проверить подключение Performance"
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
      setSuccessMessage("Первоначальная синхронизация запущена — откройте «Статус синхронизации», чтобы следить за импортом.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить первоначальную синхронизацию");
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
      setError(err instanceof Error ? err.message : "Не удалось обновить статус");
    }
  }

  if (loading) {
    return (
      <div className="py-4">
        <LoadingState message="Загрузка подключения Ozon…" />
      </div>
    );
  }

  const sellerBadgeStatus =
    sellerReady === "connected" ? "valid" : sellerReady === "error" ? "invalid" : "missing";
  const perfBadgeStatus =
    performanceReady === "set" ? "valid" : performanceReady === "error" ? "invalid" : "missing";
  const perfBadgeLabel =
    performanceReady === "set" ? "Токен задан" : performanceReady === "error" ? "Ошибка" : "Токен не задан";

  return (
    <div className="space-y-8">
      {error ? <ErrorState title="Что-то пошло не так" message={error} /> : null}
      {successMessage ? (
        <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Готовность подключения</CardTitle>
          <CardDescription>
            Seller API нужен для синхронизации каталога и заказов. Performance API необязателен и используется только для
            аналитики рекламы — первую синхронизацию можно запускать без него.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Seller API</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={sellerBadgeStatus}
                label={sellerReady === "connected" ? "Подключено" : sellerReady === "error" ? "Ошибка" : "Не задано"}
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
              Нужен только для импорта данных рекламы. Не блокирует синхронизацию Seller API и основные показатели дашборда по каталогу, заказам и остаткам.
            </p>
          </div>
        </CardContent>
      </Card>

      {performanceReady === "missing" && hasConnection ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-start gap-2">
              <Badge tone="warning">Токен Performance</Badge>
              <p className="text-sm text-amber-950">
                Нет токена Performance API — импорт рекламы может быть пропущен. Seller-синхронизация и основные метрики продолжают работать. Добавьте токен ниже, когда нужна аналитика рекламы.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showCheckSellerCallout ? (
        <Card className="border-sky-200 bg-sky-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Дальше: проверить Seller API</CardTitle>
            <CardDescription>
              Учётные данные сохранены. Запустите проверку доступа перед началом синхронизации.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="primary" disabled={checking} onClick={() => void handleCheck()}>
              {checking ? "Проверка…" : "Проверить Seller API"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isConnectionValid ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Seller API в порядке</CardTitle>
            <CardDescription>
              {syncInProgress
                ? "Задача синхронизации уже выполняется или стоит в очереди — статус смотрите на странице «Статус синхронизации»."
                : "Запустите первичный импорт товаров, заказов, остатков и рекламы."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={!showStartInitialSyncCta || startingSync}
              onClick={() => void handleInitialSync()}
            >
              {startingSync ? "Запуск…" : "Запустить первую синхронизацию"}
            </Button>
            <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
              Открыть статус синхронизации
            </Link>
            {syncStatus?.last_successful_sync_at ? (
              <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
                Открыть дашборд
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Ozon Seller API</h2>
        <p className="mb-4 text-sm text-gray-600">
          Укажите учётные данные Ozon Seller API (Client-Id и ключ API). Ключ после сохранения больше не показывается.
        </p>

        <div className="mb-4 space-y-1 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Статус Seller API:</span> {connectionStatusLabel}
          </p>
          <p>
            <span className="font-medium text-gray-900">Статус Performance API:</span>{" "}
            {performanceStatusLabel}
          </p>
          <p>
            <span className="font-medium text-gray-900">Токен Performance:</span>{" "}
            {connection?.performance_token_set ? "Задан (скрыт)" : "Не задан"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Учётные данные сохранены:</span>{" "}
            {connection?.has_credentials ? "Да" : "Нет"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Client ID:</span>{" "}
            {connection?.client_id_masked || "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя проверка Seller:</span>{" "}
            {syncStatus?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя ошибка Seller:</span>{" "}
            {syncStatus?.last_error ?? connection?.last_error ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя проверка Performance:</span>{" "}
            {syncStatus?.performance_last_check_result ??
              connection?.performance_last_check_result ??
              "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя ошибка Performance:</span>{" "}
            {syncStatus?.performance_last_error ?? connection?.performance_last_error ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последнее успешное обновление:</span>{" "}
            {syncStatus?.last_successful_sync_at ?? "—"}
          </p>
          {latestAdsImportError ? (
            <p className="text-amber-800">
              <span className="font-medium">Ошибка последнего импорта рекламы:</span> {latestAdsImportError}
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
              placeholder={hasConnection ? "Введите новый Client ID" : "Введите Client ID"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ключ API</label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasConnection ? "Введите новый ключ API" : "Введите ключ API"}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Сохранение…" : hasConnection ? "Обновить подключение" : "Сохранить подключение"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={!connection || checking}
              onClick={() => void handleCheck()}
            >
              {checking ? "Проверка…" : "Проверить Seller API"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Ozon Performance API</h2>
        <p className="mb-4 text-sm text-gray-600">
          Bearer-токен Ozon Performance API — только для синхронизации аналитики рекламы. Он отделён от ключа Seller API, хранится в зашифрованном виде и после сохранения не показывается.
        </p>

        <form onSubmit={handleSavePerformance} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Bearer-токен Performance API
            </label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
              type="password"
              autoComplete="off"
              value={performanceToken}
              onChange={(e) => setPerformanceToken(e.target.value)}
              placeholder={
                connection?.performance_token_set
                  ? "Введите новый токен, чтобы заменить сохранённый"
                  : "Вставьте bearer-токен Performance API"
              }
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={!hasConnection || savingPerf}>
              {savingPerf ? "Сохранение…" : "Сохранить токен Performance"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasConnection || savingPerf || !connection?.performance_token_set}
              onClick={() => void handleClearPerformance()}
            >
              Удалить токен
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasConnection || checkingPerf}
              onClick={() => void handleCheckPerformance()}
            >
              {checkingPerf ? "Проверка…" : "Проверить Performance API"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Первичная синхронизация (онбординг)</h2>
        <p className="mb-4 text-sm text-gray-600">
          После успешной проверки Seller API запустите первичную синхронизацию. Ход импорта смотрите на странице «Статус синхронизации».
        </p>

        <div className="mb-4 space-y-1 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Статус первой синхронизации:</span> {initialSyncLabel}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя ошибка синхронизации:</span>{" "}
            {syncStatus?.current_sync?.error_message ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Тип текущей синхронизации:</span>{" "}
            {syncStatus?.current_sync?.type ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Текущая синхронизация началась:</span>{" "}
            {syncStatus?.current_sync?.started_at ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Текущая синхронизация завершилась:</span>{" "}
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
            {startingSync ? "Запуск…" : "Запустить первую синхронизацию"}
          </Button>

          <Button type="button" variant="secondary" onClick={() => void handleRefreshStatus()}>
            Обновить статус
          </Button>
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Открыть статус синхронизации
          </Link>
        </div>

        {!isConnectionValid ? (
          <p className="mt-3 text-sm text-gray-600">
            Первая синхронизация доступна только после успешной проверки Seller API.
          </p>
        ) : null}
      </section>
    </div>
  );
}
