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
        setError(err instanceof Error ? err.message : "Не удалось загрузить статус синхронизации");
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
      setSuccessMessage("Статус обновлён");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить статус синхронизации");
    }
  }

  async function handleStartSync() {
    try {
      setStartingSync(true);
      setError("");
      setSuccessMessage("");

      await startInitialSync();
      await loadData({ silent: true });

      setSuccessMessage("Начальная синхронизация запущена");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить синхронизацию");
    } finally {
      setStartingSync(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <LoadingState message="Загрузка статуса синхронизации…" />
      </main>
    );
  }

  if (!connection) {
    return (
      <main className="space-y-6 p-6">
        <PageHeader
          title="Статус синхронизации"
          subtitle="Технический статус загрузки данных Ozon и последние задачи импорта."
        />
        <EmptyState
          title="Нет подключения Ozon"
          message="Подключите Ozon Seller API на странице интеграции, чтобы запускать и отслеживать синхронизацию."
          action={
            <Link href="/app/integrations/ozon" className={buttonClassNames("primary")}>
              Открыть интеграцию Ozon
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
        title="Статус синхронизации"
        subtitle="Технический статус загрузки данных Ozon и последние задачи импорта."
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="size-4 rounded border-gray-300"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Автообновление 5 с
        </label>
        <Button type="button" variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? "Обновление…" : "Обновить"}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleStartSync()}
          disabled={startingSync}
        >
          {startingSync ? "Запуск…" : "Запустить начальную синхронизацию"}
        </Button>
      </PageHeader>

      <p className="text-sm text-gray-600">
        После завершения синхронизации метрики и алерты пересчитываются автоматически. Откройте
        дашборд, когда ниже появится успешная синхронизация.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
          Интеграция Ozon
        </Link>
        <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
          Дашборд
        </Link>
        {adminNavLink === "show" ? (
          <Link href="/app/admin" className={buttonClassNames("secondary")}>
            Админка / поддержка
          </Link>
        ) : null}
      </div>

      {error ? <ErrorState title="Не удалось выполнить действие" message={error} /> : null}
      {successMessage ? (
        <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
      ) : null}

      {failedImportJob ? (
        <Card className="border-amber-300 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Задача импорта завершилась с ошибкой</CardTitle>
            <CardDescription>
              Домен <span className="font-medium">{failedImportJob.domain}</span> вернул ошибку.
              Остальные домены могут завершиться успешно — смотрите таблицу ниже.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-amber-950">
            <p className="font-medium">Ошибка</p>
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
            Используется только для импорта рекламной аналитики. Каталог продавца от этого не зависит.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Токен сохранён:</span>{" "}
            {status?.performance_token_set ?? connection?.performance_token_set ? "Да" : "Нет"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя проверка:</span>{" "}
            {formatDateTime(status?.performance_last_check_at ?? connection?.performance_last_check_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Результат проверки:</span>{" "}
            {status?.performance_last_check_result ?? connection?.performance_last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя ошибка:</span>{" "}
            {status?.performance_last_error ?? connection?.performance_last_error ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Подключение</CardTitle>
            {connectionStatusRaw !== "—" ? (
              <StatusBadge status={String(connectionStatusRaw)} label={String(connectionStatusRaw)} />
            ) : null}
          </div>
          <CardDescription>Последняя проверка и состояние учётных данных Ozon Seller API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Статус подключения:</span>{" "}
            {connectionStatusRaw}
          </p>
          <p>
            <span className="font-medium text-gray-900">Client ID:</span>{" "}
            {connection?.client_id_masked || "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя проверка:</span>{" "}
            {formatDateTime(status?.last_check_at ?? connection?.last_check_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Результат проверки:</span>{" "}
            {status?.last_check_result ?? connection?.last_check_result ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последняя ошибка подключения:</span>{" "}
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
            <CardTitle>Сводка синхронизации</CardTitle>
            {syncIsRunning ? (
              <StatusBadge status="running" label="Выполняется" />
            ) : syncStatusRaw !== "missing" ? (
              <StatusBadge status={String(syncStatusRaw)} label={String(syncStatusRaw)} />
            ) : (
              <StatusBadge status="missing" label="Нет активной задачи" />
            )}
          </div>
          <CardDescription>Текущая задача и последняя успешная полная синхронизация.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Тип текущей синхронизации:</span>{" "}
            {status?.current_sync?.type ?? "—"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Текущая синхронизация начата:</span>{" "}
            {formatDateTime(status?.current_sync?.started_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Текущая синхронизация завершена:</span>{" "}
            {formatDateTime(status?.current_sync?.finished_at)}
          </p>
          <p>
            <span className="font-medium text-gray-900">Последнее успешное обновление:</span>{" "}
            {formatDateTime(status?.last_successful_sync_at)}
          </p>
          {!status?.last_successful_sync_at ? (
            <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-amber-950">
              Успешной полной синхронизации ещё не было — дашборд может быть пустым, пока не завершится
              загрузка. Нажмите «Запустить начальную синхронизацию» на этой странице или в интеграции Ozon,
              если вы ещё не запускали синхронизацию.
            </p>
          ) : null}
          <p>
            <span className="font-medium text-gray-900">Ошибка последней синхронизации:</span>{" "}
            {status?.current_sync?.error_message ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Последние задачи импорта по доменам</CardTitle>
          <CardDescription>Прогресс импорта по доменам для последней синхронизации.</CardDescription>
        </CardHeader>
        <CardContent>
          {importJobs.length === 0 ? (
            <EmptyState
              title="Задач импорта пока нет"
              message="Сначала запустите начальную синхронизацию — строки появятся здесь по мере загрузки товаров, заказов, остатков и рекламы из Ozon."
              action={
                <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
                  Открыть интеграцию Ozon
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-2 py-2 font-medium text-gray-700">Домен</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Статус</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Курсор</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Получено</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Импортировано</th>
                    <th className="px-2 py-2 font-medium text-gray-700">С ошибкой</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Начало</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Конец</th>
                    <th className="px-2 py-2 font-medium text-gray-700">Ошибка</th>
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
