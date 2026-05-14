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
      error: e instanceof Error ? e.message : "Request failed",
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
    if (ingestion.error && !ing) return { tone: "error" as const, label: "Error", detail: ingestion.error };
    if (!ing) return { tone: "not_started" as const, label: "No sync", detail: "No status loaded yet." };
    const cur = ing.current_sync;
    if (cur?.status === "running" || cur?.status === "pending") {
      return { tone: "warning" as const, label: "Running", detail: mapSyncStatus(cur.status) };
    }
    if (cur?.status === "failed") {
      return { tone: "error" as const, label: "Failed", detail: cur.error_message || "Last job failed." };
    }
    if (ing.last_successful_sync_at || cur?.status === "completed") {
      return {
        tone: "done" as const,
        label: "Completed",
        detail: ing.last_successful_sync_at
          ? `Last success: ${new Date(ing.last_successful_sync_at).toLocaleString()}`
          : "Latest job completed.",
      };
    }
    return { tone: "not_started" as const, label: "No sync", detail: "Start an initial sync from Sync Status." };
  }, [ing, ingestion.error]);

  const dashboardReadiness = useMemo(() => {
    if (dashboard.error) {
      return { tone: "error" as const, label: "Unavailable", detail: dashboard.error };
    }
    const d = dashboard.data;
    if (!d) return { tone: "not_started" as const, label: "Missing", detail: "No dashboard payload." };
    const hasRows = d.top_skus && d.top_skus.length > 0;
    const hasFresh = Boolean(d.summary?.last_successful_update || d.summary?.as_of_date);
    if (hasRows || hasFresh) {
      return {
        tone: "done" as const,
        label: "Available",
        detail: d.summary?.as_of_date
          ? `As of ${d.summary.as_of_date}${d.summary.last_successful_update ? ` · updated ${new Date(d.summary.last_successful_update).toLocaleString()}` : ""}`
          : "Summary loaded.",
      };
    }
    return { tone: "not_started" as const, label: "Missing", detail: "No KPI / SKU rows yet." };
  }, [dashboard]);

  const alertsReadiness = useMemo(() => {
    if (alerts.error) {
      return {
        tone: "warning" as const,
        label: "Unavailable",
        detail: alerts.error,
      };
    }
    const a = alerts.data;
    if (!a) {
      return {
        tone: "not_started" as const,
        label: "Unknown",
        detail: "No summary.",
      };
    }
    const run = a.latest_run;
    const runFailed = run?.status?.toLowerCase() === "failed" || Boolean(run?.error_message);
    const noRun = !run;
    if (noRun && a.open_total === 0) {
      return {
        tone: "not_started" as const,
        label: `${a.open_total} open`,
        detail: "No alert runs yet.",
      };
    }
    const tone = runFailed ? ("warning" as const) : ("done" as const);
    return {
      tone,
      label: `${a.open_total} open`,
      detail: run
        ? `Latest run: ${run.status}${run.finished_at ? ` · ${new Date(run.finished_at).toLocaleString()}` : ""}${run.error_message ? ` — ${run.error_message}` : ""}`
        : "No alert runs yet.",
    };
  }, [alerts]);

  const recReadiness = useMemo(() => {
    if (recommendations.error) {
      return {
        tone: "warning" as const,
        label: "Unavailable",
        detail: recommendations.error,
      };
    }
    const r = recommendations.data;
    if (!r) {
      return {
        tone: "not_started" as const,
        label: "Unknown",
        detail: "No summary.",
      };
    }
    const run = r.latest_run;
    const runFailed = run?.status?.toLowerCase() === "failed" || Boolean(run?.error_message);
    const noRun = !run;
    if (noRun && r.open_total === 0) {
      return {
        tone: "not_started" as const,
        label: `${r.open_total} open`,
        detail: "No recommendation runs yet.",
      };
    }
    const tone = runFailed ? ("warning" as const) : ("done" as const);
    return {
      tone,
      label: `${r.open_total} open`,
      detail: run
        ? `Latest run: ${run.status}${run.finished_at ? ` · ${new Date(run.finished_at).toLocaleString()}` : ""}${run.error_message ? ` — ${run.error_message}` : ""}`
        : "No recommendation runs yet.",
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
        "Connect Ozon",
        "Save seller API credentials and pass the connection check.",
        ozonDone ? "done" : sellerConnected.kind === "warn" ? "warning" : "not_started",
        "/app/integrations/ozon",
        "Open Ozon"
      ),
      step(
        2,
        "Run initial sync",
        "Import products, orders, stocks, and ads from Ozon.",
        syncDone ? "done" : syncWarn ? "warning" : "not_started",
        "/app/sync-status",
        "Sync status"
      ),
      step(
        3,
        "Wait for post-sync recalculation",
        "Metrics and aggregates update after a successful sync.",
        dashDone && syncDone ? "done" : syncDone && !dashDone ? "warning" : "not_started",
        "/app/sync-status",
        "View sync"
      ),
      step(
        4,
        "Open dashboard",
        "Confirm KPIs and top SKUs look reasonable.",
        dashDone ? "done" : dashWarn ? "warning" : "not_started",
        "/app/dashboard",
        "Dashboard"
      ),
      step(
        5,
        "Check Critical SKU",
        "Review risk-ranked SKUs after metrics exist.",
        dashDone ? "done" : "not_started",
        "/app/critical-skus",
        "Critical SKU"
      ),
      step(
        6,
        "Check Stocks",
        "Validate replenishment signals and cover days.",
        dashDone ? "done" : "not_started",
        "/app/stocks-replenishment",
        "Stocks"
      ),
      step(
        7,
        "Open Advertising",
        "Review spend, ROAS, and risky campaigns after ads data is synced.",
        adsDone ? "done" : adsWarn ? "warning" : "not_started",
        "/app/advertising",
        "Advertising"
      ),
      step(
        8,
        "Configure Pricing Constraints",
        "Set guardrails before price-related alerts and recs.",
        "not_started",
        "/app/pricing-constraints",
        "Pricing"
      ),
      step(
        9,
        "Run Alerts",
        "Generate sales, stock, ads, and price alerts for the as-of date.",
        alertsDone ? "done" : alertsWarn ? "warning" : "not_started",
        "/app/alerts",
        "Alerts"
      ),
      step(
        10,
        "Generate Recommendations",
        "Produce AI recommendations from alerts and metrics.",
        recDone ? "done" : recWarn ? "warning" : "not_started",
        "/app/recommendations",
        "Recommendations"
      ),
      step(
        11,
        "Ask AI Chat",
        "Try natural-language questions on your account context.",
        ozonDone && syncDone && dashDone ? "done" : "not_started",
        "/app/chat",
        "Open chat"
      ),
      step(
        12,
        "Check Admin logs",
        "Internal support: clients, sync, AI traces (admin only).",
        admin?.is_admin ? "done" : "not_started",
        "/app/admin",
        "Admin"
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
      return { href: "/app/integrations/ozon", label: "Connect Ozon" };
    }
    if (syncReadiness.tone === "not_started" || syncReadiness.tone === "error") {
      return { href: "/app/sync-status", label: "Open sync & run import" };
    }
    if (dashboardReadiness.tone !== "done") {
      return { href: "/app/dashboard", label: "Open dashboard" };
    }
    const lr = recommendations.data?.latest_run;
    const recCompleted = Boolean(lr && isRunSuccessful(lr.status) && lr.finished_at);
    if (!recommendations.error && !recCompleted) {
      return { href: "/app/recommendations", label: "Generate recommendations" };
    }
    return { href: "/app/chat", label: "Try AI chat" };
  }, [sellerConnected, conn, syncReadiness, dashboardReadiness, recommendations]);

  const sellerCard = cardBadgeLabel(
    sellerConnected.kind === "ok"
      ? "ok"
      : sellerConnected.kind === "bad"
        ? "bad"
        : sellerConnected.kind === "warn"
          ? "warn"
          : "neutral",
    "Connected",
    "In progress",
    "Error",
    "Missing"
  );

  const perfCard = cardBadgeLabel(
    performanceToken.kind === "ok"
      ? "ok"
      : performanceToken.kind === "bad"
        ? "bad"
        : performanceToken.kind === "warn"
          ? "warn"
          : "neutral",
    "Set",
    "Set (verify)",
    "Error",
    "Missing"
  );

  if (loading) {
    return (
      <main className="p-6">
        <LoadingState message="Loading MVP readiness…" />
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
        title="MVP Test Home"
        subtitle="Checklist for pre-billing MVP validation. Connection, sync, analytics, alerts, AI recommendations, and chat — in one place."
      >
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
        <Link href={primaryCta.href} className={buttonClassNames("primary")}>
          {primaryCta.label}
        </Link>
      </PageHeader>

      <section aria-labelledby="readiness-heading">
        <h2 id="readiness-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Readiness
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Ozon seller connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Badge tone={readinessBadgeTone(sellerCard.tone)}>{sellerCard.label}</Badge>
              <p className="text-sm text-gray-600">
                {ozon.error
                  ? ozon.error
                  : conn
                    ? `${mapConnectionStatus(conn.status)} · client ${conn.client_id_masked}`
                    : "No connection record. Add credentials in Ozon Integration."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Ozon Performance API token</CardTitle>
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
              <CardTitle className="text-sm font-medium text-gray-500">Latest sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={syncStatusKey} label={syncReadiness.label} />
              <p className="text-sm text-gray-600">{syncReadiness.detail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Dashboard data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={dashboardStatusKey} label={dashboardReadiness.label} />
              <p className="text-sm text-gray-600">{dashboardReadiness.detail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={alertsStatusKey} label={alertsReadiness.label} />
              <p className="text-sm text-gray-600">{alertsReadiness.detail}</p>
              {alerts.error ? (
                <p className="text-xs text-amber-800">Alerts API unavailable — continue with other checks.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatusBadge status={recStatusKey} label={recReadiness.label} />
              <p className="text-sm text-gray-600">{recReadiness.detail}</p>
              {recommendations.error ? (
                <p className="text-xs text-amber-800">Recommendations API unavailable.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">AI Chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Badge tone="success">Available</Badge>
              <p className="text-sm text-gray-600">Opens the chat workspace against your seller context.</p>
              <Link href="/app/chat" className="text-sm font-medium text-blue-700 hover:underline">
                Open AI Chat →
              </Link>
            </CardContent>
          </Card>

          {admin?.is_admin ? (
            <Card className="border-indigo-200 bg-indigo-50/60 sm:col-span-2 xl:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-indigo-900">Admin / Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <p className="text-sm text-indigo-950/80">
                  You have admin access — use internal tools for client diagnostics and AI logs.
                </p>
                <Link href="/app/admin" className="text-sm font-medium text-indigo-800 hover:underline">
                  Open Admin →
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="checklist-heading">
        <h2 id="checklist-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Test checklist
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
                          {row.status === "done" ? "Done" : row.status === "warning" ? "Warning" : "Not started"}
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
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
            Ozon Integration
          </Link>
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Sync Status
          </Link>
          <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
            Dashboard
          </Link>
          <Link href="/app/alerts" className={buttonClassNames("secondary")}>
            Run Alerts
          </Link>
          <Link href="/app/recommendations" className={buttonClassNames("secondary")}>
            Generate Recommendations
          </Link>
          <Link href="/app/chat" className={buttonClassNames("secondary")}>
            Open Chat
          </Link>
          {admin?.is_admin ? (
            <Link
              href="/app/admin"
              className={cn(
                buttonClassNames("secondary"),
                "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100",
              )}
            >
              Admin
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
