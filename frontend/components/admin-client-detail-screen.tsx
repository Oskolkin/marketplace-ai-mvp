"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getAdminChatMessages,
  getAdminChatSessions,
  getAdminChatTraceDetail,
  getAdminChatTraces,
  getAdminClientBilling,
  getAdminClientChatFeedback,
  getAdminClientDetail,
  getAdminImportErrors,
  getAdminImportJobs,
  getAdminMe,
  getAdminRecommendationFeedback,
  getAdminRecommendationDetail,
  getAdminRecommendationRunDetail,
  getAdminRecommendationRuns,
  getAdminSyncCursors,
  getAdminSyncJobs,
  rerunAdminAlerts,
  rerunAdminMetrics,
  rerunAdminRecommendations,
  rerunAdminSync,
  resetAdminCursor,
  type AdminActionExecutionResult,
  type AdminActionLog,
  type AdminBillingState,
  type AdminChatMessageItem,
  type AdminChatSessionItem,
  type AdminChatTraceDetail,
  type AdminChatTraceItem,
  type AdminClientDetail,
  type AdminImportErrorItem,
  type AdminImportJobItem,
  type AdminRecommendationDiagnosticItem,
  type AdminRecommendationFeedbackResponse,
  type AdminRecommendationRawAIDetail,
  type AdminRecommendationRunDetail,
  type AdminRecommendationRunItem,
  type AdminSyncCursorItem,
  type AdminSyncJobItem,
} from "@/lib/admin-api";

type Props = { sellerAccountId: number };
type AdminTab =
  | "overview"
  | "sync_import"
  | "cursors"
  | "alerts"
  | "recommendations"
  | "chat_logs"
  | "feedback"
  | "billing"
  | "actions";
type AdminActionKey =
  | "rerun_sync"
  | "reset_cursor"
  | "rerun_metrics"
  | "rerun_alerts"
  | "rerun_recommendations";

export default function AdminClientDetailScreen({ sellerAccountId }: Props) {
  const [adminReady, setAdminReady] = useState<"loading" | "allowed" | "forbidden" | "error">("loading");
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [detail, setDetail] = useState<AdminClientDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncJobs, setSyncJobs] = useState<AdminSyncJobItem[]>([]);
  const [importJobs, setImportJobs] = useState<AdminImportJobItem[]>([]);
  const [importErrors, setImportErrors] = useState<AdminImportErrorItem[]>([]);
  const [cursors, setCursors] = useState<AdminSyncCursorItem[]>([]);
  const [runs, setRuns] = useState<AdminRecommendationRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedRun, setSelectedRun] = useState<AdminRecommendationRunDetail | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [selectedRunError, setSelectedRunError] = useState<string | null>(null);
  const [selectedRecommendationDetail, setSelectedRecommendationDetail] = useState<AdminRecommendationRawAIDetail | null>(null);
  const [selectedRecommendationLoading, setSelectedRecommendationLoading] = useState(false);
  const [selectedRecommendationError, setSelectedRecommendationError] = useState<string | null>(null);
  const [traces, setTraces] = useState<AdminChatTraceItem[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<AdminChatTraceDetail | null>(null);
  const [selectedTraceLoading, setSelectedTraceLoading] = useState(false);
  const [selectedTraceError, setSelectedTraceError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AdminChatSessionItem[]>([]);
  const [messages, setMessages] = useState<AdminChatMessageItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [chatFeedback, setChatFeedback] = useState<Array<Record<string, unknown>>>([]);
  const [recFeedback, setRecFeedback] = useState<AdminRecommendationFeedbackResponse | null>(null);
  const [billing, setBilling] = useState<AdminBillingState | null>(null);
  const [billingMissing, setBillingMissing] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [tracesError, setTracesError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [traceStatusFilter, setTraceStatusFilter] = useState("");
  const [traceIntentFilter, setTraceIntentFilter] = useState("");
  const [traceSessionFilter, setTraceSessionFilter] = useState("");

  const [actionLoading, setActionLoading] = useState<Record<AdminActionKey, boolean>>({
    rerun_sync: false,
    reset_cursor: false,
    rerun_metrics: false,
    rerun_alerts: false,
    rerun_recommendations: false,
  });
  const [actionSuccess, setActionSuccess] = useState<Record<AdminActionKey, string | null>>({
    rerun_sync: null,
    reset_cursor: null,
    rerun_metrics: null,
    rerun_alerts: null,
    rerun_recommendations: null,
  });
  const [actionErrors, setActionErrors] = useState<Record<AdminActionKey, string | null>>({
    rerun_sync: null,
    reset_cursor: null,
    rerun_metrics: null,
    rerun_alerts: null,
    rerun_recommendations: null,
  });
  const [actionResults, setActionResults] = useState<Record<AdminActionKey, AdminActionLog | null>>({
    rerun_sync: null,
    reset_cursor: null,
    rerun_metrics: null,
    rerun_alerts: null,
    rerun_recommendations: null,
  });
  const [actionRequestPayloads, setActionRequestPayloads] = useState<Record<AdminActionKey, Record<string, unknown> | null>>({
    rerun_sync: null,
    reset_cursor: null,
    rerun_metrics: null,
    rerun_alerts: null,
    rerun_recommendations: null,
  });
  const [syncType, setSyncType] = useState("initial_sync");
  const [cursorDomain, setCursorDomain] = useState("orders");
  const [cursorType, setCursorType] = useState("source_cursor");
  const [cursorValue, setCursorValue] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [asOfDate, setAsOfDate] = useState("");

  useEffect(() => {
    setAdminReady("loading");
    setError(null);
    void getAdminMe()
      .then(() => setAdminReady("allowed"))
      .catch((e: unknown) => {
        if (e instanceof Error && e.message.toLowerCase().includes("forbidden")) {
          setAdminReady("forbidden");
          return;
        }
        setAdminReady("error");
        setError(e instanceof Error ? e.message : "Failed to check admin access");
      });
  }, []);

  useEffect(() => {
    if (adminReady !== "allowed") return;
    setLoadingDetail(true);
    setError(null);
    void getAdminClientDetail(sellerAccountId)
      .then((res) => setDetail(res))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load client detail"))
      .finally(() => setLoadingDetail(false));
  }, [adminReady, sellerAccountId]);

  useEffect(() => {
    if (adminReady !== "allowed" || !detail) return;
    setTabLoading(true);
    setTabError(null);
    const load = async () => {
      if (activeTab === "sync_import") {
        const [sj, ij, ie] = await Promise.all([
          getAdminSyncJobs(sellerAccountId, { limit: 20 }),
          getAdminImportJobs(sellerAccountId, { limit: 20 }),
          getAdminImportErrors(sellerAccountId, { limit: 20 }),
        ]);
        setSyncJobs(sj.items);
        setImportJobs(ij.items);
        setImportErrors(ie.items);
      } else if (activeTab === "cursors") {
        const data = await getAdminSyncCursors(sellerAccountId, { limit: 50 });
        setCursors(data.items);
      } else if (activeTab === "recommendations") {
        setRunsLoading(true);
        setRunsError(null);
        try {
          const data = await getAdminRecommendationRuns(sellerAccountId, { limit: 20 });
          setRuns(data.items);
        } catch (e: unknown) {
          setRuns([]);
          setRunsError(e instanceof Error ? e.message : "Failed to load recommendation runs");
        } finally {
          setRunsLoading(false);
        }
      } else if (activeTab === "chat_logs") {
        setTracesLoading(true);
        setTracesError(null);
        setSessionsLoading(true);
        setSessionsError(null);
        try {
          const [tr, ss] = await Promise.all([
            getAdminChatTraces(sellerAccountId, {
              limit: 20,
              status: traceStatusFilter || undefined,
              intent: traceIntentFilter || undefined,
              session_id: traceSessionFilter ? Number(traceSessionFilter) : undefined,
            }),
            getAdminChatSessions(sellerAccountId, { limit: 20 }),
          ]);
          setTraces(tr.items);
          setSessions(ss.items);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Failed to load chat diagnostics";
          setTracesError(msg);
          setSessionsError(msg);
          setTraces([]);
          setSessions([]);
        } finally {
          setTracesLoading(false);
          setSessionsLoading(false);
        }
      } else if (activeTab === "feedback") {
        const [cf, rf] = await Promise.all([
          getAdminClientChatFeedback(sellerAccountId, { limit: 20 }),
          getAdminRecommendationFeedback(sellerAccountId, { limit: 20 }),
        ]);
        setChatFeedback(cf.items);
        setRecFeedback(rf);
      } else if (activeTab === "billing") {
        try {
          const b = await getAdminClientBilling(sellerAccountId);
          setBilling(b);
          setBillingMissing(false);
        } catch (e: unknown) {
          if (e instanceof Error && e.message.toLowerCase().includes("not found")) {
            setBilling(null);
            setBillingMissing(true);
          } else {
            throw e;
          }
        }
      }
    };
    void load()
      .catch((e: unknown) => setTabError(e instanceof Error ? e.message : "Failed to load tab data"))
      .finally(() => setTabLoading(false));
  }, [activeTab, adminReady, detail, sellerAccountId, traceIntentFilter, traceSessionFilter, traceStatusFilter]);

  const headerBadges = useMemo(() => {
    if (!detail) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge value={detail.overview.seller_status} />
        <Badge value={detail.billing?.status ?? "no billing"} />
        <Badge value={detail.connections[0]?.status ?? "no connection"} />
      </div>
    );
  }, [detail]);

  async function runAction(
    key: AdminActionKey,
    requestPayload: Record<string, unknown>,
    fn: () => Promise<AdminActionExecutionResult>,
  ) {
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    setActionSuccess((prev) => ({ ...prev, [key]: null }));
    setActionErrors((prev) => ({ ...prev, [key]: null }));
    setActionRequestPayloads((prev) => ({ ...prev, [key]: requestPayload }));
    try {
      const result = await fn();
      setActionResults((prev) => ({ ...prev, [key]: result.action }));
      if (result.ok) {
        setActionSuccess((prev) => ({
          ...prev,
          [key]: `Action queued/completed. Status: ${result.action?.status ?? "unknown"}`,
        }));
      } else {
        setActionErrors((prev) => ({ ...prev, [key]: result.error ?? "Action failed" }));
      }
      await maybeRefreshAfterAction(key, result);
    } catch (e: unknown) {
      setActionErrors((prev) => ({
        ...prev,
        [key]: e instanceof Error ? e.message : "Action failed",
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function maybeRefreshAfterAction(key: AdminActionKey, result: AdminActionExecutionResult) {
    if (!result.ok) return;
    if (key === "reset_cursor" && activeTab === "actions") {
      const data = await getAdminSyncCursors(sellerAccountId, { limit: 50 });
      setCursors(data.items);
    }
    if (key === "rerun_recommendations" && activeTab === "actions") {
      const data = await getAdminRecommendationRuns(sellerAccountId, { limit: 20 });
      setRuns(data.items);
    }
    if (key === "rerun_alerts" && detail) {
      const updated = await getAdminClientDetail(sellerAccountId);
      setDetail(updated);
    }
  }

  async function openRunDiagnostics(runId: number) {
    setSelectedRunId(runId);
    setSelectedRunLoading(true);
    setSelectedRunError(null);
    setSelectedRecommendationDetail(null);
    setSelectedRecommendationError(null);
    try {
      const data = await getAdminRecommendationRunDetail(sellerAccountId, runId);
      setSelectedRun(data);
    } catch (e: unknown) {
      setSelectedRun(null);
      setSelectedRunError(e instanceof Error ? e.message : "Failed to load run diagnostics");
    } finally {
      setSelectedRunLoading(false);
    }
  }

  async function openRecommendationRaw(recommendationId: number) {
    setSelectedRecommendationLoading(true);
    setSelectedRecommendationError(null);
    try {
      const data = await getAdminRecommendationDetail(sellerAccountId, recommendationId);
      setSelectedRecommendationDetail(data);
    } catch (e: unknown) {
      setSelectedRecommendationDetail(null);
      setSelectedRecommendationError(e instanceof Error ? e.message : "Failed to load recommendation raw AI");
    } finally {
      setSelectedRecommendationLoading(false);
    }
  }

  async function openTraceDiagnostics(traceId: number) {
    setSelectedTraceId(traceId);
    setSelectedTraceLoading(true);
    setSelectedTraceError(null);
    try {
      const data = await getAdminChatTraceDetail(sellerAccountId, traceId);
      setSelectedTrace(data);
    } catch (e: unknown) {
      setSelectedTrace(null);
      setSelectedTraceError(e instanceof Error ? e.message : "Failed to load trace diagnostics");
    } finally {
      setSelectedTraceLoading(false);
    }
  }

  async function loadSessionMessages(sessionId: number) {
    setSelectedSessionId(sessionId);
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const data = await getAdminChatMessages(sellerAccountId, sessionId, { limit: 50 });
      setMessages(data.items);
    } catch (e: unknown) {
      setMessages([]);
      setMessagesError(e instanceof Error ? e.message : "Failed to load session messages");
    } finally {
      setMessagesLoading(false);
    }
  }

  if (adminReady === "loading") return <main className="p-6 text-sm">Checking admin access...</main>;
  if (adminReady === "forbidden") return <main className="p-6 text-sm text-red-700">Admin access required.</main>;
  if (adminReady === "error") return <main className="p-6 text-sm text-red-700">{error ?? "Admin check failed."}</main>;
  if (loadingDetail) return <main className="p-6 text-sm">Loading client detail...</main>;
  if (!detail) return <main className="p-6 text-sm text-red-700">{error ?? "Client detail not found."}</main>;

  return (
    <main className="space-y-4 p-6">
      <header className="rounded border bg-white p-4">
        <Link href="/app/admin" className="text-sm text-blue-700 underline">
          ← Back to clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {detail.overview.seller_name} #{detail.overview.seller_account_id}
        </h1>
        <p className="text-sm text-gray-600">Owner: {detail.overview.owner_email ?? "—"}</p>
        {headerBadges}
      </header>

      <nav className="flex flex-wrap gap-2">
        {[
          ["overview", "Overview"],
          ["sync_import", "Sync / Import"],
          ["cursors", "Cursors"],
          ["alerts", "Alerts"],
          ["recommendations", "Recommendations"],
          ["chat_logs", "AI Chat Logs"],
          ["feedback", "Feedback"],
          ["billing", "Billing"],
          ["actions", "Admin actions"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded border px-3 py-1 text-sm ${activeTab === id ? "bg-gray-100" : "bg-white hover:bg-gray-50"}`}
            onClick={() => setActiveTab(id as AdminTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tabError ? <p className="text-sm text-red-700">{tabError}</p> : null}
      {tabLoading ? <p className="text-sm">Loading tab data...</p> : null}

      {!tabLoading && activeTab === "overview" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card title="Seller">
            <p>Status: {detail.overview.seller_status}</p>
            <p>Owner: {detail.overview.owner_email ?? "—"}</p>
            <p>Created: {fmtDate(detail.overview.created_at)}</p>
          </Card>
          <Card title="Connections">
            {detail.connections.length === 0 ? <p className="text-gray-600">No connections.</p> : detail.connections.map((c) => <p key={c.provider}>{c.provider}: {c.status}</p>)}
          </Card>
          <Card title="Latest sync">
            {detail.operational_status.latest_sync_job ? <p>#{detail.operational_status.latest_sync_job.id} {detail.operational_status.latest_sync_job.status}</p> : <p className="text-gray-600">No sync jobs.</p>}
          </Card>
          <Card title="Billing summary">
            {detail.billing ? <p>{detail.billing.plan_code} / {detail.billing.status}</p> : <p className="text-gray-600">Billing state missing.</p>}
          </Card>
        </section>
      ) : null}

      {!tabLoading && activeTab === "sync_import" ? (
        <section className="space-y-3">
          <Card title="Sync jobs">{syncJobs.length === 0 ? <p className="text-sm text-gray-600">No sync jobs found.</p> : <SimpleList rows={syncJobs.map((x) => `#${x.id} ${x.type} ${x.status} started=${fmtDate(x.started_at)}`)} />}</Card>
          <Card title="Import jobs">{importJobs.length === 0 ? <p className="text-sm text-gray-600">No import jobs found.</p> : <SimpleList rows={importJobs.map((x) => `#${x.id} ${x.domain} ${x.status} rec=${x.records_received}/${x.records_imported}/${x.records_failed}`)} />}</Card>
          <Card title="Import errors">{importErrors.length === 0 ? <p className="text-sm text-gray-600">No import errors found.</p> : <SimpleList rows={importErrors.map((x) => `job #${x.import_job_id} ${x.domain} ${x.error_message}`)} />}</Card>
        </section>
      ) : null}

      {!tabLoading && activeTab === "cursors" ? (
        <Card title="Sync cursors">
          {cursors.length === 0 ? <p className="text-sm text-gray-600">No sync cursors found.</p> : <SimpleList rows={cursors.map((x) => `${x.domain} / ${x.cursor_type}: ${x.cursor_value ?? "null"} (updated ${fmtDate(x.updated_at)})`)} />}
        </Card>
      ) : null}

      {!tabLoading && activeTab === "alerts" ? (
        <Card title="Alerts">
          <p className="text-sm">Open alerts count: {detail.operational_status.open_alerts_count}</p>
          <p className="text-sm text-gray-600 mt-1">Alert runs detail endpoint is not exposed on admin HTTP API in this step.</p>
        </Card>
      ) : null}

      {!tabLoading && activeTab === "recommendations" ? (
        <section className="space-y-3">
          <Card title="Recommendation runs">
            {runsError ? <p className="mb-2 text-sm text-red-700">{runsError}</p> : null}
            {runsLoading ? (
              <p className="text-sm">Loading recommendation runs...</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-gray-600">No recommendation runs found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-2 py-2">Run</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">As of</th>
                      <th className="px-2 py-2">Model / prompt</th>
                      <th className="px-2 py-2">Tokens / cost</th>
                      <th className="px-2 py-2">Counts</th>
                      <th className="px-2 py-2">Timing</th>
                      <th className="px-2 py-2">Error</th>
                      <th className="px-2 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b align-top">
                        <td className="px-2 py-2">#{r.id}<br />{r.run_type}</td>
                        <td className="px-2 py-2"><Badge value={r.status} /></td>
                        <td className="px-2 py-2">{r.as_of_date ?? "—"}</td>
                        <td className="px-2 py-2 text-xs">
                          <div>{r.ai_model ?? "—"}</div>
                          <div className="text-gray-600">{r.ai_prompt_version ?? "—"}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <MetricChip label="in" value={r.input_tokens} />
                            <MetricChip label="out" value={r.output_tokens} />
                            <MetricChip label="cost" value={r.estimated_cost} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div>Generated: {r.generated_recommendations_count}</div>
                          <div>Accepted: {r.accepted_recommendations_count}</div>
                          <div>Rejected: {r.rejected_recommendations_count ?? "—"}</div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div>{fmtDate(r.started_at)}</div>
                          <div>{fmtDate(r.finished_at)}</div>
                        </td>
                        <td className="px-2 py-2 text-xs text-red-700">{r.error_message ?? "—"}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                            onClick={() => void openRunDiagnostics(r.id)}
                          >
                            View diagnostics
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Recommendation run diagnostics">
            {selectedRunId != null ? <p className="mb-2 text-xs text-gray-600">Selected run: #{selectedRunId}</p> : null}
            {selectedRunLoading ? <p className="text-sm">Loading run diagnostics...</p> : null}
            {selectedRunError ? <p className="text-sm text-red-700">{selectedRunError}</p> : null}
            {!selectedRunLoading && !selectedRunError && !selectedRun ? (
              <p className="text-sm text-gray-600">Choose a run to inspect diagnostics.</p>
            ) : null}
            {selectedRun ? (
              <div className="space-y-3 text-sm">
                <div className="rounded border bg-gray-50 p-3">
                  <p className="font-medium">Run #{selectedRun.run.id} ({selectedRun.run.run_type})</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge value={selectedRun.run.status} />
                    <MetricChip label="input tokens" value={selectedRun.run.input_tokens} />
                    <MetricChip label="output tokens" value={selectedRun.run.output_tokens} />
                    <MetricChip label="estimated cost" value={selectedRun.run.estimated_cost} />
                    <MetricChip label="generated" value={selectedRun.run.generated_recommendations_count} />
                    <MetricChip label="accepted" value={selectedRun.run.accepted_recommendations_count} />
                    <MetricChip label="rejected" value={selectedRun.run.rejected_recommendations_count ?? "—"} />
                  </div>
                  <p className="mt-2 text-xs text-gray-700">
                    as_of_date={selectedRun.run.as_of_date ?? "—"}, model={selectedRun.run.ai_model ?? "—"}, prompt={selectedRun.run.ai_prompt_version ?? "—"}
                  </p>
                  {selectedRun.run.error_message ? (
                    <ErrorBox message={selectedRun.run.error_message} />
                  ) : null}
                </div>

                {selectedRun.limitations?.length ? (
                  <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
                    {selectedRun.limitations.map((l, i) => (
                      <p key={`${i}-${l}`}>{l}</p>
                    ))}
                  </div>
                ) : null}

                <div>
                  <h3 className="mb-2 font-medium">Associated recommendations</h3>
                  {selectedRun.recommendations.length === 0 ? (
                    <p className="text-xs text-gray-600">No associated recommendations.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRun.recommendations.map((rec) => (
                        <div key={rec.id} className="rounded border p-2 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">#{rec.id} {rec.title}</p>
                              <p className="text-gray-700">
                                {rec.recommendation_type} · {rec.priority_level}/{rec.confidence_level} · {rec.status}
                              </p>
                              <p className="text-gray-700">entity: {formatEntity(rec.entity_type, rec.entity_id, rec.entity_sku, rec.entity_offer_id)}</p>
                            </div>
                            <button
                              type="button"
                              className="rounded border px-2 py-1 hover:bg-gray-50"
                              onClick={() => void openRecommendationRaw(rec.id)}
                            >
                              View recommendation raw AI
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 font-medium">Diagnostics</h3>
                  {selectedRun.diagnostics.length === 0 ? (
                    <p className="text-xs text-gray-600">No diagnostics found.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedRun.diagnostics.map((diag: AdminRecommendationDiagnosticItem) => (
                        <div key={diag.id} className="rounded border p-3">
                          <p className="text-xs font-medium">Diagnostic #{diag.id} · request={diag.openai_request_id ?? "—"}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <MetricChip label="input tokens" value={diag.input_tokens} />
                            <MetricChip label="output tokens" value={diag.output_tokens} />
                            <MetricChip label="estimated cost" value={diag.estimated_cost} />
                          </div>
                          <p className="mt-2 text-xs text-gray-700">
                            model={diag.ai_model ?? "—"}, prompt={diag.prompt_version ?? "—"}, created={fmtDate(diag.created_at)}
                          </p>
                          {(diag.error_message || diag.error_stage) ? (
                            <ErrorBox message={diag.error_message ?? "Diagnostic failed"} stage={diag.error_stage ?? undefined} />
                          ) : null}
                          <InternalSupportDataNotice />
                          <div className="mt-2 space-y-2">
                            <JsonDetailsBlock title="Context payload summary" data={diag.context_payload_summary} />
                            <JsonDetailsBlock title="Raw OpenAI response" data={diag.raw_openai_response} />
                            <JsonDetailsBlock title="Validation result" data={diag.validation_result_payload} />
                            <JsonDetailsBlock title="Rejected items" data={diag.rejected_items_payload} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Recommendation raw AI detail">
            {selectedRecommendationLoading ? <p className="text-sm">Loading recommendation detail...</p> : null}
            {selectedRecommendationError ? <p className="text-sm text-red-700">{selectedRecommendationError}</p> : null}
            {!selectedRecommendationLoading && !selectedRecommendationError && !selectedRecommendationDetail ? (
              <p className="text-sm text-gray-600">Pick a recommendation from run diagnostics.</p>
            ) : null}
            {selectedRecommendationDetail ? (
              <div className="space-y-3 text-sm">
                <div className="rounded border bg-gray-50 p-3">
                  <p className="font-medium">
                    #{selectedRecommendationDetail.recommendation.id} {selectedRecommendationDetail.recommendation.title}
                  </p>
                  <p className="text-xs text-gray-700">
                    {selectedRecommendationDetail.recommendation.recommendation_type} · {selectedRecommendationDetail.recommendation.priority_level}/{selectedRecommendationDetail.recommendation.confidence_level} · {selectedRecommendationDetail.recommendation.status}
                  </p>
                  <p className="text-xs text-gray-700">
                    entity: {formatEntity(
                      selectedRecommendationDetail.recommendation.entity_type,
                      selectedRecommendationDetail.recommendation.entity_id,
                      selectedRecommendationDetail.recommendation.entity_sku,
                      selectedRecommendationDetail.recommendation.entity_offer_id,
                    )}
                  </p>
                  <p className="mt-2 text-xs">{selectedRecommendationDetail.recommendation.recommended_action ?? "—"}</p>
                  <p className="text-xs text-gray-700">expected effect: {selectedRecommendationDetail.recommendation.expected_effect ?? "—"}</p>
                </div>
                {selectedRecommendationDetail.related_alerts.length > 0 ? (
                  <div className="rounded border p-3 text-xs">
                    <p className="mb-1 font-medium">Related alerts ({selectedRecommendationDetail.related_alerts.length})</p>
                    <ul className="space-y-1">
                      {selectedRecommendationDetail.related_alerts.map((a) => (
                        <li key={a.id}>#{a.id} {a.alert_type} · {a.severity}/{a.urgency} · {a.status}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selectedRecommendationDetail.limitations?.length ? (
                  <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
                    {selectedRecommendationDetail.limitations.map((l, i) => (
                      <p key={`${i}-${l}`}>{l}</p>
                    ))}
                  </div>
                ) : null}
                <InternalSupportDataNotice />
                <JsonDetailsBlock title="Supporting metrics payload" data={selectedRecommendationDetail.recommendation.supporting_metrics_payload} />
                <JsonDetailsBlock title="Constraints payload" data={selectedRecommendationDetail.recommendation.constraints_payload} />
                <JsonDetailsBlock title="Raw AI response" data={selectedRecommendationDetail.recommendation.raw_ai_response} />
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {!tabLoading && activeTab === "chat_logs" ? (
        <section className="space-y-3">
          <Card title="Trace filters">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">status</span>
                <input className="w-full rounded border px-2 py-1 text-sm" value={traceStatusFilter} onChange={(e) => setTraceStatusFilter(e.target.value)} placeholder="completed / failed" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">intent</span>
                <input className="w-full rounded border px-2 py-1 text-sm" value={traceIntentFilter} onChange={(e) => setTraceIntentFilter(e.target.value)} placeholder="sales" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">session_id</span>
                <input className="w-full rounded border px-2 py-1 text-sm" value={traceSessionFilter} onChange={(e) => setTraceSessionFilter(e.target.value)} placeholder="123" />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setActiveTab("chat_logs")}
                >
                  Refresh
                </button>
              </div>
            </div>
          </Card>

          <Card title="Chat traces">
            {tracesError ? <p className="mb-2 text-sm text-red-700">{tracesError}</p> : null}
            {tracesLoading ? (
              <p className="text-sm">Loading chat traces...</p>
            ) : traces.length === 0 ? (
              <p className="text-sm text-gray-600">No chat traces found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-2 py-2">Trace</th>
                      <th className="px-2 py-2">Intent / status</th>
                      <th className="px-2 py-2">Models</th>
                      <th className="px-2 py-2">Prompts</th>
                      <th className="px-2 py-2">Tokens / cost</th>
                      <th className="px-2 py-2">Timing</th>
                      <th className="px-2 py-2">Error</th>
                      <th className="px-2 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.map((t) => (
                      <tr key={t.id} className="border-b align-top">
                        <td className="px-2 py-2 text-xs">
                          <div>trace #{t.id}</div>
                          <div>session #{t.session_id}</div>
                          <div>user_msg #{t.user_message_id ?? "—"}</div>
                          <div>assistant_msg #{t.assistant_message_id ?? "—"}</div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div>{t.detected_intent ?? "—"}</div>
                          <Badge value={t.status} />
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div>{t.planner_model}</div>
                          <div>{t.answer_model}</div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div>{t.planner_prompt_version}</div>
                          <div>{t.answer_prompt_version}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <MetricChip label="in" value={t.input_tokens} />
                            <MetricChip label="out" value={t.output_tokens} />
                            <MetricChip label="cost" value={t.estimated_cost} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div>{fmtDate(t.started_at)}</div>
                          <div>{fmtDate(t.finished_at)}</div>
                        </td>
                        <td className="px-2 py-2 text-xs text-red-700">{t.error_message ?? "—"}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                            onClick={() => void openTraceDiagnostics(t.id)}
                          >
                            View trace
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Chat trace diagnostics">
            {selectedTraceId != null ? <p className="mb-2 text-xs text-gray-600">Selected trace: #{selectedTraceId}</p> : null}
            {selectedTraceLoading ? <p className="text-sm">Loading trace detail...</p> : null}
            {selectedTraceError ? <p className="text-sm text-red-700">{selectedTraceError}</p> : null}
            {!selectedTraceLoading && !selectedTraceError && !selectedTrace ? (
              <p className="text-sm text-gray-600">Pick a trace to inspect diagnostics.</p>
            ) : null}
            {selectedTrace ? (
              <div className="space-y-3 text-sm">
                <div className="rounded border bg-gray-50 p-3">
                  <p className="font-medium">Trace #{selectedTrace.trace.id} / Session #{selectedTrace.trace.session_id}</p>
                  <p className="text-xs text-gray-700">
                    intent={selectedTrace.trace.detected_intent ?? "—"} · planner={selectedTrace.trace.planner_model} · answer={selectedTrace.trace.answer_model}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge value={selectedTrace.trace.status} />
                    <MetricChip label="input tokens" value={selectedTrace.trace.input_tokens} />
                    <MetricChip label="output tokens" value={selectedTrace.trace.output_tokens} />
                    <MetricChip label="estimated cost" value={selectedTrace.trace.estimated_cost} />
                  </div>
                  {(selectedTrace.trace.error_message) ? (
                    <ErrorBox message={selectedTrace.trace.error_message} />
                  ) : null}
                  <p className="mt-2 text-xs text-gray-700">
                    started={fmtDate(selectedTrace.trace.started_at)}, finished={fmtDate(selectedTrace.trace.finished_at)}, created={fmtDate(selectedTrace.trace.created_at)}
                  </p>
                </div>
                <div className="rounded border p-3">
                  <p className="mb-2 font-medium">Messages</p>
                  {selectedTrace.messages.length === 0 ? (
                    <p className="text-xs text-gray-600">No messages attached.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedTrace.messages.map((m) => (
                        <div key={m.id} className={`rounded border p-2 text-xs ${m.role === "user" ? "bg-blue-50" : "bg-gray-50"}`}>
                          <p className="font-medium">{m.role === "user" ? "User question" : m.role === "assistant" ? "Assistant answer" : m.role}</p>
                          <p className="text-gray-700">{m.message_type} · {fmtDate(m.created_at)}</p>
                          <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedTrace.limitations?.length ? (
                  <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
                    {selectedTrace.limitations.map((l, i) => (
                      <p key={`${i}-${l}`}>{l}</p>
                    ))}
                  </div>
                ) : null}
                <InternalSupportDataNotice />
                <JsonDetailsBlock title="Tool plan" data={selectedTrace.payloads.tool_plan_payload} />
                <JsonDetailsBlock title="Validated tool plan" data={selectedTrace.payloads.validated_tool_plan_payload} />
                <JsonDetailsBlock title="Tool results" data={selectedTrace.payloads.tool_results_payload} />
                <JsonDetailsBlock title="Fact context" data={selectedTrace.payloads.fact_context_payload} />
                <JsonDetailsBlock title="Raw planner response" data={selectedTrace.payloads.raw_planner_response} />
                <JsonDetailsBlock title="Raw answer response" data={selectedTrace.payloads.raw_answer_response} />
                <JsonDetailsBlock title="Answer validation" data={selectedTrace.payloads.answer_validation_payload} />
              </div>
            ) : null}
          </Card>

          <Card title="Chat sessions">
            {sessionsError ? <p className="mb-2 text-sm text-red-700">{sessionsError}</p> : null}
            {sessionsLoading ? (
              <p className="text-sm">Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-gray-600">No chat sessions found.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border p-2 text-xs">
                    <div>
                      <p className="font-medium">#{s.id} {s.title}</p>
                      <p className="text-gray-700">{s.status} · last={fmtDate(s.last_message_at)}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 hover:bg-gray-50"
                      onClick={() => void loadSessionMessages(s.id)}
                    >
                      Load messages
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Session messages">
            {selectedSessionId == null ? <p className="text-sm text-gray-600">Choose a session and click Load messages.</p> : null}
            {messagesError ? <p className="mb-2 text-sm text-red-700">{messagesError}</p> : null}
            {messagesLoading ? (
              <p className="text-sm">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-600">No messages loaded.</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="rounded border bg-gray-50 p-2 text-xs">
                    <p className="font-medium">{m.role} · {m.message_type}</p>
                    <p className="text-gray-700">{fmtDate(m.created_at)}</p>
                    <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      ) : null}

      {!tabLoading && activeTab === "feedback" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card title="Chat feedback">
            {chatFeedback.length === 0 ? <p className="text-sm text-gray-600">No feedback found.</p> : <SimpleList rows={chatFeedback.map((f) => `${String((f as { rating?: string }).rating ?? "—")} ${(f as { comment?: string }).comment ?? ""}`)} />}
          </Card>
          <Card title="Recommendation feedback">
            {!recFeedback || recFeedback.items.length === 0 ? (
              <p className="text-sm text-gray-600">No feedback found.</p>
            ) : (
              <>
                <SimpleList rows={recFeedback.items.map((i) => `${i.rating} - ${i.recommendation.title} (${i.recommendation.status})`)} />
                <p className="mt-2 text-xs text-gray-700">
                  proxy: accepted={recFeedback.proxy_status_feedback.accepted_count}, dismissed={recFeedback.proxy_status_feedback.dismissed_count}, resolved={recFeedback.proxy_status_feedback.resolved_count}
                </p>
              </>
            )}
          </Card>
        </section>
      ) : null}

      {!tabLoading && activeTab === "billing" ? (
        <Card title="Billing">
          {billingMissing ? (
            <p className="text-sm text-gray-600">Billing state is not configured for this client.</p>
          ) : !billing ? (
            <p className="text-sm">Loading...</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
              <p>plan_code: {billing.plan_code}</p>
              <p>status: {billing.status}</p>
              <p>trial_ends_at: {fmtDate(billing.trial_ends_at)}</p>
              <p>period: {fmtDate(billing.current_period_start)} — {fmtDate(billing.current_period_end)}</p>
              <p>ai_tokens_limit_month: {billing.ai_tokens_limit_month ?? "—"}</p>
              <p>ai_tokens_used_month: {billing.ai_tokens_used_month}</p>
              <p>estimated_ai_cost_month: {billing.estimated_ai_cost_month}</p>
              <p>notes: {billing.notes ?? "—"}</p>
              <p>updated_at: {fmtDate(billing.updated_at)}</p>
            </div>
          )}
        </Card>
      ) : null}

      {!tabLoading && activeTab === "actions" ? (
        <section className="space-y-3">
          <Card title="Rerun sync">
            <p className="mb-2 text-sm text-gray-600">Start a new sync job for this client.</p>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">sync_type</span>
              <select className="rounded border px-2 py-1 text-sm" value={syncType} onChange={(e) => setSyncType(e.target.value)}>
                <option value="initial_sync">initial_sync</option>
              </select>
            </label>
            <button
              type="button"
              className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={actionLoading.rerun_sync}
              onClick={() => {
                if (!window.confirm("Start a new sync job for this client? This will not reuse previous failed jobs.")) return;
                const payload = { sync_type: "initial_sync" };
                void runAction("rerun_sync", payload, () => rerunAdminSync(sellerAccountId, payload));
              }}
            >
              {actionLoading.rerun_sync ? "Running..." : "Rerun sync"}
            </button>
            <ActionResultCard
              result={actionResults.rerun_sync}
              error={actionErrors.rerun_sync}
              success={actionSuccess.rerun_sync}
              requestPayload={actionRequestPayloads.rerun_sync}
            />
          </Card>

          <Card title="Reset cursor">
            <p className="mb-2 text-sm text-gray-600">Reset sync cursor for a specific domain/cursor type.</p>
            <p className="mb-2 rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-900">
              Warning: resetting a cursor can cause the next sync to re-import data from the selected point.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">domain</span>
                <input className="w-full rounded border px-2 py-1 text-sm" value={cursorDomain} onChange={(e) => setCursorDomain(e.target.value)} placeholder="orders" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">cursor_type</span>
                <input className="w-full rounded border px-2 py-1 text-sm" value={cursorType} onChange={(e) => setCursorType(e.target.value)} placeholder="source_cursor" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">cursor_value (optional)</span>
                <input className="w-full rounded border px-2 py-1 text-sm" value={cursorValue} onChange={(e) => setCursorValue(e.target.value)} placeholder="empty = null" />
              </label>
            </div>
            {(!cursorDomain.trim() || !cursorType.trim()) && actionErrors.reset_cursor ? (
              <p className="mt-2 text-sm text-red-700">{actionErrors.reset_cursor}</p>
            ) : null}
            <button
              type="button"
              className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={actionLoading.reset_cursor || !cursorDomain.trim() || !cursorType.trim()}
              onClick={() => {
                const domain = cursorDomain.trim();
                const cursor_type = cursorType.trim();
                if (!domain || !cursor_type) {
                  setActionErrors((prev) => ({ ...prev, reset_cursor: "domain and cursor_type are required" }));
                  return;
                }
                if (!window.confirm("Reset this sync cursor? The next sync may re-import data for this domain.")) return;
                const payload = {
                  domain,
                  cursor_type,
                  cursor_value: cursorValue.trim() === "" ? null : cursorValue.trim(),
                };
                void runAction("reset_cursor", payload, () => resetAdminCursor(sellerAccountId, payload));
              }}
            >
              {actionLoading.reset_cursor ? "Running..." : "Reset cursor"}
            </button>
            <ActionResultCard
              result={actionResults.reset_cursor}
              error={actionErrors.reset_cursor}
              success={actionSuccess.reset_cursor}
              requestPayload={actionRequestPayloads.reset_cursor}
            />
          </Card>

          <Card title="Rerun metrics">
            <p className="mb-2 text-sm text-gray-600">Recompute metrics for a date range.</p>
            <p className="mb-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-900">
              This action may fail with not configured status if metrics dependency is not wired in this environment.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">date_from</span>
                <input className="w-full rounded border px-2 py-1 text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">date_to</span>
                <input className="w-full rounded border px-2 py-1 text-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
            <button
              type="button"
              className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={actionLoading.rerun_metrics}
              onClick={() => {
                if (!dateFrom || !dateTo) {
                  setActionErrors((prev) => ({ ...prev, rerun_metrics: "date_from and date_to are required" }));
                  return;
                }
                if (new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
                  setActionErrors((prev) => ({ ...prev, rerun_metrics: "date_from must be earlier than or equal to date_to" }));
                  return;
                }
                if (!window.confirm("Rerun metrics for the selected date range?")) return;
                const payload = { date_from: dateFrom, date_to: dateTo };
                void runAction("rerun_metrics", payload, () => rerunAdminMetrics(sellerAccountId, payload));
              }}
            >
              {actionLoading.rerun_metrics ? "Running..." : "Rerun metrics"}
            </button>
            <ActionResultCard
              result={actionResults.rerun_metrics}
              error={actionErrors.rerun_metrics}
              success={actionSuccess.rerun_metrics}
              requestPayload={actionRequestPayloads.rerun_metrics}
            />
          </Card>

          <Card title="Rerun alerts">
            <p className="mb-2 text-sm text-gray-600">Run Alerts Engine for selected date.</p>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">as_of_date</span>
              <input className="w-full rounded border px-2 py-1 text-sm md:w-64" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </label>
            <button
              type="button"
              className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={actionLoading.rerun_alerts}
              onClick={() => {
                if (!asOfDate) {
                  setActionErrors((prev) => ({ ...prev, rerun_alerts: "as_of_date is required" }));
                  return;
                }
                if (!window.confirm("Rerun Alerts Engine for this client and date?")) return;
                const payload = { as_of_date: asOfDate };
                void runAction("rerun_alerts", payload, () => rerunAdminAlerts(sellerAccountId, payload));
              }}
            >
              {actionLoading.rerun_alerts ? "Running..." : "Rerun alerts"}
            </button>
            <ActionResultCard
              result={actionResults.rerun_alerts}
              error={actionErrors.rerun_alerts}
              success={actionSuccess.rerun_alerts}
              requestPayload={actionRequestPayloads.rerun_alerts}
            />
          </Card>

          <Card title="Rerun recommendations">
            <p className="mb-2 text-sm text-gray-600">Run AI recommendation generation for selected date.</p>
            <p className="mb-2 rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-900">
              Warning: rerunning recommendations can call OpenAI API and create token usage / estimated cost.
            </p>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">as_of_date</span>
              <input className="w-full rounded border px-2 py-1 text-sm md:w-64" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </label>
            <button
              type="button"
              className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={actionLoading.rerun_recommendations}
              onClick={() => {
                if (!asOfDate) {
                  setActionErrors((prev) => ({ ...prev, rerun_recommendations: "as_of_date is required" }));
                  return;
                }
                if (!window.confirm("Rerun AI recommendations? This can call OpenAI API and create additional token usage/cost.")) return;
                const payload = { as_of_date: asOfDate };
                void runAction("rerun_recommendations", payload, () => rerunAdminRecommendations(sellerAccountId, payload));
              }}
            >
              {actionLoading.rerun_recommendations ? "Running..." : "Rerun recommendations"}
            </button>
            <ActionResultCard
              result={actionResults.rerun_recommendations}
              error={actionErrors.rerun_recommendations}
              success={actionSuccess.rerun_recommendations}
              requestPayload={actionRequestPayloads.rerun_recommendations}
            />
          </Card>
        </section>
      ) : null}
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SimpleList({ rows }: { rows: string[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r, i) => (
        <li key={`${i}-${r}`} className="rounded border bg-gray-50 px-2 py-1">
          {r}
        </li>
      ))}
    </ul>
  );
}

function ActionResultCard({
  result,
  error,
  success,
  requestPayload,
}: {
  result: AdminActionLog | null;
  error: string | null;
  success: string | null;
  requestPayload: Record<string, unknown> | null;
}) {
  return (
    <div className="mt-3 space-y-2">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      {!result ? null : (
        <div className="rounded border bg-gray-50 p-2 text-sm">
          <p>
            Last result: Action log #{result.id}
          </p>
          <p>
            Status: <b>{result.status}</b>
          </p>
          <p>Finished: {fmtDate(result.finished_at)}</p>
          {result.error_message ? <p className="text-red-700">Error: {result.error_message}</p> : null}
          {requestPayload ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs">Request payload</summary>
              <pre className="mt-1 overflow-auto rounded border bg-white p-2 text-xs">
                {JSON.stringify(requestPayload, null, 2)}
              </pre>
            </details>
          ) : null}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">Result payload</summary>
            <pre className="mt-1 overflow-auto rounded border bg-white p-2 text-xs">
              {JSON.stringify(result.result_payload ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function InternalSupportDataNotice() {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      Internal support data. Do not share externally.
    </div>
  );
}

function JsonDetailsBlock({
  title,
  data,
  defaultOpen = false,
}: {
  title: string;
  data: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <details className="rounded border bg-white p-2" open={defaultOpen}>
      <summary className="cursor-pointer text-xs font-medium">{title}</summary>
      {isEmptyData(data) ? (
        <p className="mt-2 text-xs text-gray-600">No data available.</p>
      ) : (
        <pre className="mt-2 overflow-auto rounded border bg-gray-50 p-2 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </details>
  );
}

function MetricChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs">
      {label}: {String(value)}
    </span>
  );
}

function ErrorBox({ message, stage }: { message: string; stage?: string }) {
  return (
    <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
      <p className="font-medium">Error</p>
      {stage ? <p>Stage: {stage}</p> : null}
      <p>{message}</p>
    </div>
  );
}

function formatEntity(
  entityType?: string | null,
  entityId?: string | null,
  entitySku?: number | null,
  entityOfferId?: string | null,
): string {
  if (entitySku != null) return `sku:${entitySku}`;
  if (entityOfferId) return `offer:${entityOfferId}`;
  if (entityId) return `id:${entityId}`;
  return entityType ?? "—";
}

function isEmptyData(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}

function Badge({ value }: { value: string }) {
  const v = value.toLowerCase();
  let cls = "border-gray-300 bg-gray-100 text-gray-700";
  if (["completed", "valid", "active", "trial", "open"].includes(v)) cls = "border-green-300 bg-green-50 text-green-700";
  if (["running", "pending"].includes(v)) cls = "border-blue-300 bg-blue-50 text-blue-700";
  if (["failed", "error", "invalid", "past_due"].includes(v)) cls = "border-red-300 bg-red-50 text-red-700";
  if (["internal", "missing", "unknown", "no billing", "no connection"].includes(v)) cls = "border-yellow-300 bg-yellow-50 text-yellow-700";
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${cls}`}>{value}</span>;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
