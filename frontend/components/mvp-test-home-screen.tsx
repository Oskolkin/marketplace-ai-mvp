"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClassNames } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/components/ui/cn";
import { getAlertsSummary } from "@/lib/alerts-api";
import { getAdminMe } from "@/lib/admin-api";
import { getDashboardSummary } from "@/lib/analytics-api";
import {
  mapConnectionStatus,
  mapPerformanceConnectionStatus,
  mapSyncStatus,
} from "@/lib/ozon-ui";
import { getOzonConnection, getOzonIngestionStatus } from "@/lib/ozon-api";
import { getRecommendationsSummary } from "@/lib/recommendations-api";
import type {
  GetOzonConnectionResponse,
  OzonIngestionStatusResponse,
} from "@/lib/ozon-api";
import type { DashboardSummaryResponse } from "@/lib/analytics-api";
import type { AlertsSummaryResponse } from "@/lib/alerts-api";
import type { RecommendationsSummary } from "@/lib/recommendations-api";

type LoadState<T> = { data: T | null; error: string | null };

type StepStatus = "done" | "warning" | "not_started";

type ChecklistStep = {
  id: number;
  title: string;
  hint: string;
  status: StepStatus;
  actionHref: string;
  actionLabel: string;
};

function isRunSuccessful(status: string | null | undefined): boolean {
  const v = (status || "").toLowerCase();
  return v === "completed" || v === "success" || v === "succeeded";
}

function readinessBadgeTone(t: "done" | "warning" | "error" | "not_started"): BadgeTone {
  switch (t) {
    case "done":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

function stepStatusBadgeTone(s: StepStatus): BadgeTone {
  if (s === "done") return "success";
  if (s === "warning") return "warning";
  return "neutral";
}

function cardBadgeLabel(
  kind: "ok" | "warn" | "bad" | "neutral",
  ok: string,
  warn: string,
  bad: string,
  neutral: string
): { label: string; tone: "done" | "warning" | "error" | "not_started" } {
  if (kind === "ok") return { label: ok, tone: "done" };
  if (kind === "warn") return { label: warn, tone: "warning" };
  if (kind === "bad") return { label: bad, tone: "error" };
  return { label: neutral, tone: "not_started" };
}

async function safeLoad<T>(fn: () => Promise<T>): Promise<LoadState<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Запрос не выполнен",
    };
  }
}

export default function MvpTestHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [ozon, setOzon] = useState<LoadState<GetOzonConnectionResponse>>({ data: null, error: null });
  const [ingestion, setIngestion] = useState<LoadState<OzonIngestionStatusResponse>>({
    data: null,
    error: null,
  });
  const [dashboard, setDashboard] = useState<LoadState<DashboardSummaryResponse>>({
    data: null,
    error: null,
  });
  const [alerts, setAlerts] = useState<LoadState<AlertsSummaryResponse>>({ data: null, error: null });
  const [recommendations, setRecommendations] = useState<LoadState<RecommendationsSummary>>({
    data: null,
    error: null,
  });
  const [admin, setAdmin] = useState<{ is_admin: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rOzon, rIng, rDash, rAlerts, rRec, adminCap] = await Promise.all([
      safeLoad(() => getOzonConnection()),
      safeLoad(() => getOzonIngestionStatus()),
      safeLoad(() => getDashboardSummary()),
      safeLoad(() => getAlertsSummary()),
      safeLoad(() => getRecommendationsSummary()),
      (async (): Promise<{ is_admin: boolean } | null> => {
        try {
          const d = await getAdminMe();
          return d.is_admin ? { is_admin: true } : null;
        } catch {
          return null;
        }
      })(),
    ]);

    setOzon({ data: rOzon.data, error: rOzon.error });
    setIngestion({ data: rIng.data, error: rIng.error });
    setDashboard({ data: rDash.data, error: rDash.error });
    setAlerts({ data: rAlerts.data, error: rAlerts.error });
    setRecommendations({ data: rRec.data, error: rRec.error });
    setAdmin(adminCap);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const conn = ozon.data?.connection ?? null;
  const ing = ingestion.data;

  const sellerConnected = useMemo(() => {
    if (ozon.error) return { kind: "bad" as const };
    if (!conn) return { kind: "neutral" as const };
    if (conn.status === "invalid") return { kind: "bad" as const };
    if (conn.status === "valid" || conn.status === "sync_pending" || conn.status === "sync_in_progress") {
      return { kind: "ok" as const };
    }
    if (conn.has_credentials && conn.status === "checking") return { kind: "warn" as const };
    if (conn.has_credentials) return { kind: "warn" as const };
    return { kind: "neutral" as const };
  }, [conn, ozon.error]);

  const performanceToken = useMemo(() => {
    const tokenSet = conn?.performance_token_set ?? ing?.performance_token_set ?? false;
    const perfStatus = conn?.performance_status ?? ing?.performance_connection_status;
    if (ozon.error && ingestion.error) return { kind: "bad" as const, tokenSet: false, perfStatus };
    if (!conn && !ing) return { kind: "neutral" as const, tokenSet: false, perfStatus };
    if (perfStatus === "invalid") return { kind: "bad" as const, tokenSet, perfStatus };
    if (tokenSet && perfStatus === "valid") return { kind: "ok" as const, tokenSet, perfStatus };
    if (tokenSet) return { kind: "warn" as const, tokenSet, perfStatus };
    return { kind: "neutral" as const, tokenSet: false, perfStatus };
  }, [conn, ing, ozon.error, ingestion.error]);

  const syncReadiness = useMemo(() => {
    if (ingestion.error && !ing) return { tone: "error" as const, label: "Ошибка", detail: ingestion.error };
    if (!ing) return { tone: "not_started" as const, label: "Нет синхронизации", detail: "Статус ещё не загружен." };
    const cur = ing.current_sync;
    if (cur?.status === "running" || cur?.status === "pending") {
      return { tone: "warning" as const, label: "Выполняется", detail: mapSyncStatus(cur.status) };
    }
    if (cur?.status === "failed") {
      return { tone: "error" as const, label: "Сбой", detail: cur.error_message || "Последняя задача завершилась с ошибкой." };
    }
    if (ing.last_successful_sync_at || cur?.status === "completed") {
      return {
        tone: "done" as const,
        label: "Завершено",
        detail: ing.last_successful_sync_at
          ? `Последний успех: ${new Date(ing.last_successful_sync_at).toLocaleString()}`
          : "Последняя задача выполнена.",
      };
    }
    return { tone: "not_started" as const, label: "Нет синхронизации", detail: "Запустите начальную синхронизацию на странице «Статус синхронизации»." };
  }, [ing, ingestion.error]);

  const dashboardReadiness = useMemo(() => {
    if (dashboard.error) {
      return { tone: "error" as const, label: "Недоступно", detail: dashboard.error };
    }
    const d = dashboard.data;
    if (!d) return { tone: "not_started" as const, label: "Нет данных", detail: "Сводка дашборда не получена." };
    const hasRows = d.top_skus && d.top_skus.length > 0;
    const hasFresh = Boolean(d.summary?.last_successful_update || d.summary?.as_of_date);
    if (hasRows || hasFresh) {
      return {
        tone: "done" as const,
        label: "Доступно",
        detail: d.summary?.as_of_date
          ? `На дату ${d.summary.as_of_date}${d.summary.last_successful_update ? ` · обновлено ${new Date(d.summary.last_successful_update).toLocaleString()}` : ""}`
          : "Сводка загружена.",
      };
    }
    return { tone: "not_started" as const, label: "Нет данных", detail: "Пока нет строк KPI и SKU." };
  }, [dashboard]);

  const alertsReadiness = useMemo(() => {
    if (alerts.error) {
      return {
        tone: "warning" as const,
        label: "Недоступно",
        detail: alerts.error,
      };
    }
    const a = alerts.data;
    if (!a) {
      return {
        tone: "not_started" as const,
        label: "Неизвестно",
        detail: "Нет сводки.",
      };
    }
    const run = a.latest_run;
    const runFailed = run?.status?.toLowerCase() === "failed" || Boolean(run?.error_message);
    const noRun = !run;
    if (noRun && a.open_total === 0) {
      return {
        tone: "not_started" as const,
        label: `${a.open_total} открыто`,
        detail: "Запусков алертов ещё не было.",
      };
    }
    const tone = runFailed ? ("warning" as const) : ("done" as const);
    return {
      tone,
      label: `${a.open_total} открыто`,
      detail: run
        ? `Последний запуск: ${run.status}${run.finished_at ? ` · ${new Date(run.finished_at).toLocaleString()}` : ""}${run.error_message ? ` — ${run.error_message}` : ""}`
        : "Запусков алертов ещё не было.",
    };
  }, [alerts]);

  const recReadiness = useMemo(() => {
    if (recommendations.error) {
      return {
        tone: "warning" as const,
        label: "Недоступно",
        detail: recommendations.error,
      };
    }
    const r = recommendations.data;
    if (!r) {
      return {
        tone: "not_started" as const,
        label: "Неизвестно",
        detail: "Нет сводки.",
      };
    }
    const run = r.latest_run;
    const runFailed = run?.status?.toLowerCase() === "failed" || Boolean(run?.error_message);
    const noRun = !run;
    if (noRun && r.open_total === 0) {
      return {
        tone: "not_started" as const,
        label: `${r.open_total} открыто`,
        detail: "Запусков рекомендаций ещё не было.",
      };
    }
    const tone = runFailed ? ("warning" as const) : ("done" as const);
    return {
      tone,
      label: `${r.open_total} открыто`,
      detail: run
        ? `Последний запуск: ${run.status}${run.finished_at ? ` · ${new Date(run.finished_at).toLocaleString()}` : ""}${run.error_message ? ` — ${run.error_message}` : ""}`
        : "Запусков рекомендаций ещё не было.",
    };
  }, [recommendations]);

  const checklist = useMemo((): ChecklistStep[] => {
    const ozonDone = sellerConnected.kind === "ok";
    const syncDone = syncReadiness.tone === "done";
    const syncWarn = syncReadiness.tone === "warning" || syncReadiness.tone === "error";
    const dashDone = dashboardReadiness.tone === "done";
    const dashWarn = dashboardReadiness.tone === "error";
    const alertsDone =
      isRunSuccessful(alerts.data?.latest_run?.status) ||
      ((alerts.data?.open_total ?? 0) > 0 && alerts.data?.latest_run?.status?.toLowerCase() !== "failed");
    const alertsWarn = Boolean(alerts.data?.latest_run?.error_message || alerts.error);
    const recDone =
      isRunSuccessful(recommendations.data?.latest_run?.status) ||
      ((recommendations.data?.open_total ?? 0) > 0 &&
        recommendations.data?.latest_run?.status?.toLowerCase() !== "failed");
    const recWarn = Boolean(recommendations.data?.latest_run?.error_message || recommendations.error);

    const step = (
      id: number,
      title: string,
      hint: string,
      s: StepStatus,
      href: string,
      label: string
    ): ChecklistStep => ({ id, title, hint, status: s, actionHref: href, actionLabel: label });

    const adsDone = dashDone && performanceToken.kind === "ok";
    const adsWarn =
      dashDone &&
      (performanceToken.kind === "bad" ||
        performanceToken.kind === "neutral" ||
        performanceToken.kind === "warn");

    return [
      step(
        1,
        "Подключить Ozon",
        "Сохраните API-ключи продавца и пройдите проверку подключения.",
        ozonDone ? "done" : sellerConnected.kind === "warn" ? "warning" : "not_started",
        "/app/integrations/ozon",
        "Открыть Ozon"
      ),
      step(
        2,
        "Запустить начальную синхронизацию",
        "Импортируйте товары, заказы, остатки и рекламу из Ozon.",
        syncDone ? "done" : syncWarn ? "warning" : "not_started",
        "/app/sync-status",
        "Статус синхронизации"
      ),
      step(
        3,
        "Дождаться пересчёта после синхронизации",
        "Метрики и агрегаты обновляются после успешной синхронизации.",
        dashDone && syncDone ? "done" : syncDone && !dashDone ? "warning" : "not_started",
        "/app/sync-status",
        "Смотреть синхронизацию"
      ),
      step(
        4,
        "Открыть дашборд",
        "Проверьте KPI и топ SKU.",
        dashDone ? "done" : dashWarn ? "warning" : "not_started",
        "/app/dashboard",
        "Дашборд"
      ),
      step(
        5,
        "Проверить критичные SKU",
        "Просмотрите SKU с рисками после появления метрик.",
        dashDone ? "done" : "not_started",
        "/app/critical-skus",
        "Критичные SKU"
      ),
      step(
        6,
        "Проверить остатки",
        "Оцените сигналы пополнения и дни покрытия.",
        dashDone ? "done" : "not_started",
        "/app/stocks-replenishment",
        "Остатки"
      ),
      step(
        7,
        "Открыть рекламу",
        "Проверьте расход, ROAS и рисковые кампании после синка рекламы.",
        adsDone ? "done" : adsWarn ? "warning" : "not_started",
        "/app/advertising",
        "Реклама"
      ),
      step(
        8,
        "Настроить ограничения цен",
        "Задайте ограничения до алертов и рекомендаций по ценам.",
        "not_started",
        "/app/pricing-constraints",
        "Цены"
      ),
      step(
        9,
        "Запустить алерты",
        "Сформируйте алерты по продажам, остаткам, рекламе и ценам на дату отчёта.",
        alertsDone ? "done" : alertsWarn ? "warning" : "not_started",
        "/app/alerts",
        "Алерты"
      ),
      step(
        10,
        "Сгенерировать рекомендации",
        "Создайте ИИ-рекомендации на основе алертов и метрик.",
        recDone ? "done" : recWarn ? "warning" : "not_started",
        "/app/recommendations",
        "Рекомендации"
      ),
      step(
        11,
        "Чат с ИИ",
        "Задавайте вопросы на естественном языке по контексту аккаунта.",
        ozonDone && syncDone && dashDone ? "done" : "not_started",
        "/app/chat",
        "Открыть чат"
      ),
      step(
        12,
        "Журналы администратора",
        "Внутренняя поддержка: клиенты, синхронизация, трейсы ИИ (только для админов).",
        admin?.is_admin ? "done" : "not_started",
        "/app/admin",
        "Админка"
      ),
    ];
  }, [
    sellerConnected,
    syncReadiness,
    dashboardReadiness,
    alerts.data,
    alerts.error,
    recommendations.data,
    recommendations.error,
    performanceToken,
    admin,
  ]);

  const primaryCta = useMemo(() => {
    if (sellerConnected.kind !== "ok" || !conn) {
      return { href: "/app/integrations/ozon", label: "Подключить Ozon" };
    }
    if (syncReadiness.tone === "not_started" || syncReadiness.tone === "error") {
      return { href: "/app/sync-status", label: "Синхронизация и импорт" };
    }
    if (dashboardReadiness.tone !== "done") {
      return { href: "/app/dashboard", label: "Открыть дашборд" };
    }
    const lr = recommendations.data?.latest_run;
    const recCompleted = Boolean(lr && isRunSuccessful(lr.status) && lr.finished_at);
    if (!recommendations.error && !recCompleted) {
      return { href: "/app/recommendations", label: "Сгенерировать рекомендации" };
    }
    return { href: "/app/chat", label: "Попробовать ИИ-чат" };
  }, [sellerConnected, conn, syncReadiness, dashboardReadiness, recommendations]);

  const sellerCard = cardBadgeLabel(
    sellerConnected.kind === "ok"
      ? "ok"
      : sellerConnected.kind === "bad"
        ? "bad"
        : sellerConnected.kind === "warn"
          ? "warn"
          : "neutral",
    "Подключено",
    "В процессе",
    "Ошибка",
    "Нет данных"
  );

  const perfCard = cardBadgeLabel(
    performanceToken.kind === "ok"
      ? "ok"
      : performanceToken.kind === "bad"
        ? "bad"
        : performanceToken.kind === "warn"
          ? "warn"
          : "neutral",
    "Задан",
    "Задан (проверьте)",
    "Ошибка",
    "Нет данных"
  );

  if (loading) {
    return (
      <main className="p-6">
        <LoadingState message="Загрузка готовности MVP…" />
      </main>
    );
  }

  const syncStatusKey =
    syncReadiness.tone === "error"
      ? "failed"
      : syncReadiness.tone === "done"
        ? "completed"
        : syncReadiness.tone === "warning"
          ? ing?.current_sync?.status ?? "pending"
          : "missing";

  const dashboardStatusKey =
    dashboardReadiness.tone === "done" ? "valid" : dashboardReadiness.tone === "error" ? "error" : "missing";

  const alertsStatusKey = alerts.error
    ? "error"
    : alertsReadiness.tone === "not_started"
      ? "missing"
      : alerts.data?.latest_run?.status ?? "open";

  const recStatusKey = recommendations.error
    ? "error"
    : recReadiness.tone === "not_started"
      ? "missing"
      : recommendations.data?.latest_run?.status ?? "open";

  return (
    <main className="space-y-8 p-6">
      <PageHeader
        title="Главная MVP-теста"
        subtitle="Чеклист проверки MVP перед биллингом: подключение, синхронизация, аналитика, алерты, ИИ-рекомендации и чат — в одном месте."
      >
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Обновить
        </Button>
        <Link href={primaryCta.href} className={buttonClassNames("primary")}>
          {primaryCta.label}
        </Link>
      </PageHeader>

      <section aria-labelledby="readiness-heading">
        <h2 id="readiness-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Готовность
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Подключение продавца Ozon</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Badge tone={readinessBadgeTone(sellerCard.tone)}>{sellerCard.label}</Badge>
              <p className="text-sm text-gray-600">
                {ozon.error
                  ? ozon.error
                  : conn
                    ? `${mapConnectionStatus(conn.status)} · client ${conn.client_id_masked}`
                    : "Нет записи о подключении. Добавьте ключи в интеграции Ozon."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Токен Ozon Performance API</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Badge tone={readinessBadgeTone(perfCard.tone)}>{perfCard.label}</Badge>
              <p className="text-sm text-gray-600">
                {mapPerformanceConnectionStatus(performanceToken.perfStatus)}
                {conn?.performance_last_error ? ` — ${conn.performance_last_error}` : null}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Последняя синхронизация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={syncStatusKey} label={syncReadiness.label} />
              <p className="text-sm text-gray-600">{syncReadiness.detail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Данные дашборда</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={dashboardStatusKey} label={dashboardReadiness.label} />
              <p className="text-sm text-gray-600">{dashboardReadiness.detail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Алерты</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={alertsStatusKey} label={alertsReadiness.label} />
              <p className="text-sm text-gray-600">{alertsReadiness.detail}</p>
              {alerts.error ? (
                <p className="text-xs text-amber-800">API алертов недоступен — продолжите другие проверки.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Рекомендации</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={recStatusKey} label={recReadiness.label} />
              <p className="text-sm text-gray-600">{recReadiness.detail}</p>
              {recommendations.error ? (
                <p className="text-xs text-amber-800">API рекомендаций недоступен.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">ИИ-чат</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Badge tone="success">Доступен</Badge>
              <p className="text-sm text-gray-600">Чат в контексте вашего магазина продавца.</p>
              <Link href="/app/chat" className="text-sm font-medium text-blue-700 hover:underline">
                Открыть ИИ-чат →
              </Link>
            </CardContent>
          </Card>

          {admin?.is_admin ? (
            <Card className="border-indigo-200 bg-indigo-50/60 sm:col-span-2 xl:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-indigo-900">Админка / поддержка</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <p className="text-sm text-indigo-950/80">
                  У вас есть права администратора — используйте внутренние инструменты для диагностики клиентов и логов ИИ.
                </p>
                <Link href="/app/admin" className="text-sm font-medium text-indigo-800 hover:underline">
                  Открыть админку →
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="checklist-heading">
        <h2 id="checklist-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Тестовый чеклист
        </h2>
        <ol className="space-y-3">
          {checklist.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="shrink-0 text-sm font-medium text-gray-400">{row.id}.</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{row.title}</span>
                        <Badge tone={stepStatusBadgeTone(row.status)}>
                          {row.status === "done" ? "Готово" : row.status === "warning" ? "Внимание" : "Не начато"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{row.hint}</p>
                    </div>
                  </div>
                  <Link
                    href={row.actionHref}
                    className={cn(buttonClassNames("secondary"), "w-full shrink-0 justify-center sm:w-auto")}
                  >
                    {row.actionLabel}
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Быстрые действия
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
            Интеграция Ozon
          </Link>
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Статус синхронизации
          </Link>
          <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
            Дашборд
          </Link>
          <Link href="/app/alerts" className={buttonClassNames("secondary")}>
            Запустить алерты
          </Link>
          <Link href="/app/recommendations" className={buttonClassNames("secondary")}>
            Сгенерировать рекомендации
          </Link>
          <Link href="/app/chat" className={buttonClassNames("secondary")}>
            Открыть чат
          </Link>
          {admin?.is_admin ? (
            <Link
              href="/app/admin"
              className={cn(
                buttonClassNames("secondary"),
                "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100",
              )}
            >
              Админка
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
