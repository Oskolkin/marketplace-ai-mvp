"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { buttonClassNames } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAlertsSummary, type AlertsSummaryResponse } from "@/lib/alerts-api";
import {
  MVP_RECOMMENDATION_TYPES,
  acceptRecommendation,
  dismissRecommendation,
  generateRecommendations,
  getRecommendationDetail,
  getRecommendations,
  getRecommendationsSummary,
  resolveRecommendation,
  type GenerateRecommendationsResponse,
  type RecommendationDetail,
  type RecommendationItem,
  type RecommendationsSummary,
} from "@/lib/recommendations-api";

const DEFAULT_LIMIT = 50;

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;

type FilterState = {
  status: "" | "open" | "accepted" | "dismissed" | "resolved";
  recommendationTypeSelect: string;
  recommendationTypeText: string;
  priority_level: "" | "low" | "medium" | "high" | "critical";
  confidence_level: "" | "low" | "medium" | "high";
  horizon: "" | "short_term" | "medium_term" | "long_term";
  entity_type: "" | "account" | "sku" | "product" | "campaign" | "pricing_constraint";
  limit: number;
  offset: number;
};

type QuickFilterId = "open" | "critical" | "high" | "short_term";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function fmtEntityRec(row: Pick<RecommendationItem, "entity_sku" | "entity_offer_id" | "entity_id" | "entity_type">): string {
  if (row.entity_sku != null && row.entity_sku !== undefined) {
    return `SKU: ${row.entity_sku}`;
  }
  if (row.entity_offer_id) return `Offer: ${row.entity_offer_id}`;
  if (row.entity_id) return `ID: ${row.entity_id}`;
  return row.entity_type;
}

function effectiveRecommendationType(f: FilterState): string | undefined {
  const text = f.recommendationTypeText.trim();
  if (text) return text;
  if (f.recommendationTypeSelect) return f.recommendationTypeSelect;
  return undefined;
}

function groupRecommendationsByPriority(items: RecommendationItem[]): { level: string; rows: RecommendationItem[] }[] {
  const by = new Map<string, RecommendationItem[]>();
  for (const row of items) {
    const level = row.priority_level || "other";
    const list = by.get(level) ?? [];
    list.push(row);
    by.set(level, list);
  }
  for (const list of by.values()) {
    list.sort((a, b) => {
      const hz = horizonRank(a.horizon) - horizonRank(b.horizon);
      if (hz !== 0) return hz;
      return b.priority_score - a.priority_score;
    });
  }
  const seen = new Set<string>();
  const levels: string[] = [];
  for (const p of PRIORITY_ORDER) {
    if ((by.get(p) ?? []).length > 0) {
      levels.push(p);
      seen.add(p);
    }
  }
  for (const k of by.keys()) {
    if (!seen.has(k)) {
      levels.push(k);
      seen.add(k);
    }
  }
  return levels.map((level) => ({ level, rows: by.get(level) ?? [] }));
}

function horizonRank(h: string): number {
  if (h === "short_term") return 0;
  if (h === "medium_term") return 1;
  if (h === "long_term") return 2;
  return 3;
}

function matchesQuickFilter(id: QuickFilterId, f: FilterState): boolean {
  const recType = effectiveRecommendationType(f);
  if (recType || f.confidence_level || f.entity_type) return false;
  if (f.status !== "open") return false;
  if (id === "open") return !f.priority_level && !f.horizon;
  if (id === "critical") return f.priority_level === "critical" && !f.horizon;
  if (id === "high") return f.priority_level === "high" && !f.horizon;
  if (id === "short_term") return f.horizon === "short_term" && !f.priority_level;
  return false;
}

function quickFilterPreset(id: QuickFilterId): Partial<FilterState> {
  const base: Partial<FilterState> = {
    status: "open",
    recommendationTypeSelect: "",
    recommendationTypeText: "",
    confidence_level: "",
    entity_type: "",
    offset: 0,
  };
  if (id === "open") return { ...base, priority_level: "", horizon: "" };
  if (id === "critical") return { ...base, priority_level: "critical", horizon: "" };
  if (id === "high") return { ...base, priority_level: "high", horizon: "" };
  return { ...base, priority_level: "", horizon: "short_term" };
}

function extractValidationWarnings(detail: RecommendationDetail): string[] {
  const out: string[] = [];
  if (detail.validation_warnings?.length) {
    out.push(...detail.validation_warnings);
  }
  const sm = detail.supporting_metrics_payload;
  if (sm && typeof sm === "object") {
    for (const key of ["warnings", "validation_warnings", "validator_warnings"] as const) {
      const v = (sm as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const x of v) {
          if (typeof x === "string") out.push(x);
        }
      }
    }
  }
  return [...new Set(out)];
}

function friendlyGenerateMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("503") || s.includes("502") || s.includes("openai") || s.includes("unauthorized")) {
    return "Generation failed — the AI service may be misconfigured or temporarily unavailable.";
  }
  if (raw.length > 220) {
    return "Generation failed — see checklist below and server logs if needed.";
  }
  return raw;
}

export default function RecommendationsScreen() {
  const [alertsSummary, setAlertsSummary] = useState<AlertsSummaryResponse | null>(null);
  const [summary, setSummary] = useState<RecommendationsSummary | null>(null);
  const [loadingPrerequisites, setLoadingPrerequisites] = useState(true);
  const [prerequisitesError, setPrerequisitesError] = useState<string | null>(null);

  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    status: "",
    recommendationTypeSelect: "",
    recommendationTypeText: "",
    priority_level: "",
    confidence_level: "",
    horizon: "",
    entity_type: "",
    limit: DEFAULT_LIMIT,
    offset: 0,
  });

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RecommendationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [generateAsOf, setGenerateAsOf] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastGenerateResult, setLastGenerateResult] = useState<GenerateRecommendationsResponse | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPrerequisites = useCallback(async () => {
    setLoadingPrerequisites(true);
    setPrerequisitesError(null);
    try {
      const [alerts, rec] = await Promise.all([getAlertsSummary(), getRecommendationsSummary()]);
      setAlertsSummary(alerts);
      setSummary(rec);
    } catch (e: unknown) {
      setAlertsSummary(null);
      setSummary(null);
      setPrerequisitesError(e instanceof Error ? e.message : "Failed to load prerequisites");
    } finally {
      setLoadingPrerequisites(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const recType = effectiveRecommendationType(filters);
      const data = await getRecommendations({
        status: filters.status || undefined,
        recommendation_type: recType,
        priority_level: filters.priority_level || undefined,
        confidence_level: filters.confidence_level || undefined,
        horizon: filters.horizon || undefined,
        entity_type: filters.entity_type || undefined,
        limit: filters.limit,
        offset: filters.offset,
      });
      setItems(data.items);
    } catch (e: unknown) {
      setItems([]);
      setListError(e instanceof Error ? e.message : "Failed to load recommendations");
    } finally {
      setLoadingList(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadPrerequisites();
  }, [loadPrerequisites]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    void getRecommendationDetail(detailId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(e instanceof Error ? e.message : "Failed to load detail");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPrerequisites(), loadList()]);
    if (detailId != null) {
      try {
        const d = await getRecommendationDetail(detailId);
        setDetail(d);
        setDetailError(null);
      } catch (e: unknown) {
        setDetailError(e instanceof Error ? e.message : "Failed to refresh detail");
      }
    }
  }, [detailId, loadList, loadPrerequisites]);

  async function handleGenerate() {
    setGenerateLoading(true);
    setGenerateMessage(null);
    setGenerateError(null);
    setLastGenerateResult(null);
    try {
      const payload =
        generateAsOf.trim() === ""
          ? undefined
          : { as_of_date: generateAsOf.trim() };
      const res = await generateRecommendations(payload);
      setLastGenerateResult(res);
      setGenerateMessage("Generation finished. Summary below.");
      await refreshAll();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Generate failed";
      setGenerateError(friendlyGenerateMessage(raw));
    } finally {
      setGenerateLoading(false);
    }
  }

  async function runRowAction(
    id: number,
    kind: "accept" | "dismiss" | "resolve",
  ): Promise<void> {
    setActionLoadingId(id);
    setActionMessage(null);
    setActionError(null);
    try {
      let updated: RecommendationItem;
      if (kind === "accept") updated = await acceptRecommendation(id);
      else if (kind === "dismiss") updated = await dismissRecommendation(id);
      else updated = await resolveRecommendation(id);
      setActionMessage(`Recommendation #${id} is now ${updated.status}.`);
      await Promise.all([loadPrerequisites(), loadList()]);
      if (detailId === id) {
        try {
          const d = await getRecommendationDetail(id);
          setDetail(d);
          setDetailError(null);
        } catch (e: unknown) {
          setDetailError(e instanceof Error ? e.message : "Failed to refresh detail");
        }
      }
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoadingId(null);
    }
  }

  const applyQuickFilter = useCallback((id: QuickFilterId) => {
    setFilters((s) => ({ ...s, ...quickFilterPreset(id) }));
  }, []);

  const typeSelectOptions = useMemo((): [string, string][] => {
    const rows: [string, string][] = MVP_RECOMMENDATION_TYPES.map((t) => [t, t]);
    return [["", "all"], ...rows];
  }, []);

  const groupedItems = useMemo(() => groupRecommendationsByPriority(items), [items]);

  const alertsRun = alertsSummary?.latest_run;
  const recRun = summary?.latest_run;
  const noOpenAlerts = alertsSummary != null && (alertsSummary.open_total ?? 0) === 0;
  const listIsEmpty = !loadingList && !listError && items.length === 0;
  const defaultishFilters =
    filters.offset === 0 &&
    !effectiveRecommendationType(filters) &&
    !filters.confidence_level &&
    !filters.entity_type;

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Recommendations"
        subtitle="AI recommendation engine: prerequisites, generation runs, validated output, and status actions."
      />

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Before generation</h2>
        <p className="mt-1 text-sm text-gray-600">
          Typical order: <strong>sync</strong> → <strong>metrics / dashboard</strong> →{" "}
          <Link href="/app/alerts" className="text-blue-700 underline">
            run Alerts
          </Link>{" "}
          → then generate recommendations here.
        </p>
        {prerequisitesError ? (
          <p className="mt-2 text-sm text-amber-900" role="alert">
            {prerequisitesError}
          </p>
        ) : null}
        {loadingPrerequisites ? (
          <div className="mt-4">
            <LoadingState message="Loading alerts & recommendations status…" />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
              <h3 className="text-sm font-semibold text-gray-800">Latest alerts run</h3>
              {!alertsRun ? (
                <p className="mt-2 text-sm text-gray-600">No alert runs yet. Open Alerts and run a job first.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-gray-800">
                  <li>
                    <span className="text-gray-600">Status:</span>{" "}
                    <RunStatusBadge status={alertsRun.status} />
                  </li>
                  <li>
                    <span className="text-gray-600">Run id:</span> {alertsRun.id}
                  </li>
                  <li>
                    <span className="text-gray-600">Finished:</span> {fmtDate(alertsRun.finished_at)}
                  </li>
                  <li>
                    <span className="text-gray-600">Open alerts:</span> {alertsSummary?.open_total ?? "—"}
                  </li>
                  {alertsRun.error_message ? (
                    <li className="text-amber-900">
                      <span className="font-medium">Error:</span> {alertsRun.error_message}
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
              <h3 className="text-sm font-semibold text-gray-800">Latest recommendations run</h3>
              {!recRun ? (
                <p className="mt-2 text-sm text-gray-600">No recommendation runs yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-gray-800">
                  <li>
                    <span className="text-gray-600">Status:</span> <RunStatusBadge status={recRun.status} />
                  </li>
                  <li>
                    <span className="text-gray-600">As of:</span> {recRun.as_of_date ?? "—"}
                  </li>
                  <li>
                    <span className="text-gray-600">Generated (last run):</span>{" "}
                    {recRun.generated_recommendations_count}
                  </li>
                  <li>
                    <span className="text-gray-600">Tokens:</span> {recRun.input_tokens} / {recRun.output_tokens} /{" "}
                    {recRun.total_tokens}
                  </li>
                  <li>
                    <span className="text-gray-600">Est. cost:</span>{" "}
                    {recRun.estimated_cost != null ? recRun.estimated_cost.toFixed(4) : "—"}
                  </li>
                  {recRun.error_message ? (
                    <li className="text-amber-900">
                      <span className="font-medium">Error:</span> {recRun.error_message}
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Sync status
          </Link>
          <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
            Dashboard
          </Link>
          <Link href="/app/alerts" className={buttonClassNames("secondary")}>
            Alerts
          </Link>
          <Link href="/app/pricing-constraints" className={buttonClassNames("secondary")}>
            Pricing constraints
          </Link>
        </div>
      </section>

      {!loadingPrerequisites && summary ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Summary counts</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            <SummaryCard label="Open" value={summary.open_total} />
            <SummaryCard label="Critical" value={summary.by_priority.critical} />
            <SummaryCard label="High" value={summary.by_priority.high} />
            <SummaryCard label="Medium" value={summary.by_priority.medium} />
            <SummaryCard label="Low" value={summary.by_priority.low} />
            <SummaryCard label="Confidence high" value={summary.by_confidence.high} />
            <SummaryCard label="Confidence medium" value={summary.by_confidence.medium} />
            <SummaryCard label="Confidence low" value={summary.by_confidence.low} />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Generate recommendations</h2>
        <p className="mt-1 text-sm text-gray-600">
          Uses current context (alerts, metrics, pricing). Optional <code className="rounded bg-gray-100 px-1">as_of_date</code>{" "}
          pins the reporting day.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">As of date</span>
            <input
              className="rounded-lg border border-gray-300 px-2 py-2"
              type="date"
              value={generateAsOf}
              onChange={(e) => setGenerateAsOf(e.target.value)}
              disabled={generateLoading}
            />
          </label>
          <button
            type="button"
            disabled={generateLoading}
            className={buttonClassNames("primary")}
            onClick={() => void handleGenerate()}
          >
            {generateLoading ? "Generating…" : "Generate recommendations"}
          </button>
        </div>
        {generateLoading ? (
          <div className="mt-4">
            <LoadingState message="Running AI recommendation generation…" />
          </div>
        ) : null}
        {generateMessage ? <p className="mt-3 text-sm text-green-800">{generateMessage}</p> : null}
        {generateError ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
            <p className="font-medium">{generateError}</p>
            <p className="mt-2 font-medium text-amber-900">Checklist</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-950">
              <li>OpenAI API key configured for the deployment?</li>
              <li>Alerts exist for the as-of date (run Alerts first)?</li>
              <li>Pricing constraints set where price recommendations need them (optional)?</li>
              <li>Context / token budget exceeded? Try a narrower as_of_date or fewer open alerts.</li>
              <li>Validation rejecting all items? Inspect rejected reasons in server logs.</li>
            </ul>
          </div>
        ) : null}
        {lastGenerateResult ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-800">Last run result</h3>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-gray-600">Run id</dt>
                <dd className="font-mono font-medium text-gray-900">{lastGenerateResult.run_id}</dd>
              </div>
              <div>
                <dt className="text-gray-600">As of date</dt>
                <dd className="font-medium text-gray-900">{fmtDateShort(lastGenerateResult.as_of_date)}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Generated</dt>
                <dd className="font-medium text-gray-900">{lastGenerateResult.generated_total}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Valid</dt>
                <dd className="font-medium text-gray-900">{lastGenerateResult.valid_total}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Rejected</dt>
                <dd className="font-medium text-gray-900">{lastGenerateResult.rejected_total}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Saved (upserted)</dt>
                <dd className="font-medium text-gray-900">{lastGenerateResult.upserted_total}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Linked alerts</dt>
                <dd className="font-medium text-gray-900">{lastGenerateResult.linked_alerts_total}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Warnings (items)</dt>
                <dd className="font-medium text-gray-900">{lastGenerateResult.warnings_total}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Tokens (in / out / total)</dt>
                <dd className="font-mono text-gray-900">
                  {lastGenerateResult.input_tokens} / {lastGenerateResult.output_tokens} /{" "}
                  {lastGenerateResult.total_tokens}
                </dd>
              </div>
              {lastGenerateResult.estimated_cost != null ? (
                <div>
                  <dt className="text-gray-600">Estimated cost</dt>
                  <dd className="font-medium text-gray-900">{lastGenerateResult.estimated_cost}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Quick filters</h2>
        <p className="mb-3 text-sm text-gray-600">Narrow the list (status = open + one dimension).</p>
        <div className="flex flex-wrap gap-2">
          {(["open", "critical", "high", "short_term"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={
                matchesQuickFilter(id, filters)
                  ? `${buttonClassNames("primary")} ring-2 ring-blue-300`
                  : buttonClassNames("secondary")
              }
              onClick={() => applyQuickFilter(id)}
            >
              {id === "open"
                ? "Open"
                : id === "critical"
                  ? "Critical"
                  : id === "high"
                    ? "High"
                    : "Short-term"}
            </button>
          ))}
        </div>

        <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">Advanced filters</summary>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Select
              label="Status"
              value={filters.status}
              onChange={(v) =>
                setFilters((s) => ({
                  ...s,
                  status: v as FilterState["status"],
                  offset: 0,
                }))
              }
              options={[
                ["", "all"],
                ["open", "open"],
                ["accepted", "accepted"],
                ["dismissed", "dismissed"],
                ["resolved", "resolved"],
              ]}
            />
            <Select
              label="Type (preset)"
              value={filters.recommendationTypeSelect}
              onChange={(v) =>
                setFilters((s) => ({
                  ...s,
                  recommendationTypeSelect: v,
                  offset: 0,
                }))
              }
              options={typeSelectOptions}
            />
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-gray-700">Type (free text)</span>
              <input
                className="w-full rounded border px-2 py-1"
                type="text"
                placeholder="e.g. replenish_sku"
                value={filters.recommendationTypeText}
                onChange={(e) =>
                  setFilters((s) => ({
                    ...s,
                    recommendationTypeText: e.target.value,
                    offset: 0,
                  }))
                }
              />
            </label>
            <Select
              label="Priority"
              value={filters.priority_level}
              onChange={(v) =>
                setFilters((s) => ({
                  ...s,
                  priority_level: v as FilterState["priority_level"],
                  offset: 0,
                }))
              }
              options={[
                ["", "all"],
                ["low", "low"],
                ["medium", "medium"],
                ["high", "high"],
                ["critical", "critical"],
              ]}
            />
            <Select
              label="Confidence"
              value={filters.confidence_level}
              onChange={(v) =>
                setFilters((s) => ({
                  ...s,
                  confidence_level: v as FilterState["confidence_level"],
                  offset: 0,
                }))
              }
              options={[
                ["", "all"],
                ["low", "low"],
                ["medium", "medium"],
                ["high", "high"],
              ]}
            />
            <Select
              label="Horizon"
              value={filters.horizon}
              onChange={(v) =>
                setFilters((s) => ({
                  ...s,
                  horizon: v as FilterState["horizon"],
                  offset: 0,
                }))
              }
              options={[
                ["", "all"],
                ["short_term", "short_term"],
                ["medium_term", "medium_term"],
                ["long_term", "long_term"],
              ]}
            />
            <Select
              label="Entity type"
              value={filters.entity_type}
              onChange={(v) =>
                setFilters((s) => ({
                  ...s,
                  entity_type: v as FilterState["entity_type"],
                  offset: 0,
                }))
              }
              options={[
                ["", "all"],
                ["account", "account"],
                ["sku", "sku"],
                ["product", "product"],
                ["campaign", "campaign"],
                ["pricing_constraint", "pricing_constraint"],
              ]}
            />
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">Limit</span>
              <input
                className="w-full rounded border px-2 py-1"
                type="number"
                min={1}
                max={200}
                value={filters.limit}
                onChange={(e) =>
                  setFilters((s) => ({
                    ...s,
                    limit: Math.max(1, Math.min(200, Number(e.target.value) || DEFAULT_LIMIT)),
                    offset: 0,
                  }))
                }
              />
            </label>
          </div>
        </details>
      </section>

      {listError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{listError}</p>
      ) : null}
      {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}
      {actionMessage ? <p className="text-sm text-green-800">{actionMessage}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Recommendations</h2>
          {loadingList ? (
            <LoadingState message="Loading recommendations…" />
          ) : listIsEmpty ? (
            <EmptyState
              title="No recommendations"
              message={
                defaultishFilters
                  ? "Nothing matches the current filters, or generation has not produced rows yet."
                  : "No rows for these filters. Widen filters or reset quick filters."
              }
              action={
                <div className="flex flex-col items-center gap-2 sm:flex-row">
                  <button type="button" className={buttonClassNames("primary")} onClick={() => void handleGenerate()}>
                    Generate recommendations
                  </button>
                  {noOpenAlerts ? (
                    <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                      Run alerts first
                    </Link>
                  ) : null}
                </div>
              }
            />
          ) : (
            <div className="space-y-6">
              {groupedItems.map(({ level, rows }) => (
                <Fragment key={level}>
                  <h3 className="border-b pb-1 text-sm font-semibold uppercase tracking-wide text-gray-700">
                    Priority: {level}{" "}
                    <span className="font-normal normal-case text-gray-500">({rows.length})</span>
                  </h3>
                  <ul className="space-y-3">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className={`rounded-lg border p-3 transition-colors ${
                          detailId === row.id ? "border-blue-400 bg-blue-50/50" : "border-gray-200 bg-gray-50/40"
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setDetailId(row.id)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <PriorityBadge level={row.priority_level} />
                            <HorizonBadge horizon={row.horizon} />
                            <ConfidenceBadge level={row.confidence_level} />
                            <UrgencyBadge urgency={row.urgency} />
                            <StatusBadge status={row.status} />
                            <span className="text-xs text-gray-500">#{row.id}</span>
                          </div>
                          <p className="mt-2 font-medium text-gray-900">{row.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-gray-700">{row.what_happened}</p>
                          <p className="mt-1 text-xs text-gray-600">{fmtEntityRec(row)}</p>
                          <p className="mt-1 text-xs text-gray-500">Updated {fmtDate(row.last_seen_at)}</p>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                          <button
                            type="button"
                            className={buttonClassNames("secondary")}
                            onClick={() => setDetailId(row.id)}
                          >
                            Details
                          </button>
                          {row.status === "open" ? (
                            <>
                              <button
                                type="button"
                                disabled={actionLoadingId === row.id}
                                className={buttonClassNames("primary")}
                                onClick={() => void runRowAction(row.id, "accept")}
                              >
                                {actionLoadingId === row.id ? "…" : "Accept"}
                              </button>
                              <button
                                type="button"
                                disabled={actionLoadingId === row.id}
                                className={buttonClassNames("secondary")}
                                onClick={() => void runRowAction(row.id, "dismiss")}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                disabled={actionLoadingId === row.id}
                                className={buttonClassNames("secondary")}
                                onClick={() => void runRowAction(row.id, "resolve")}
                              >
                                Resolve
                              </button>
                            </>
                          ) : (
                            <span className="self-center text-xs text-gray-500">Status: {row.status} — actions locked</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Fragment>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={filters.offset === 0 || loadingList}
              className={buttonClassNames("secondary")}
              onClick={() =>
                setFilters((s) => ({
                  ...s,
                  offset: Math.max(0, s.offset - s.limit),
                }))
              }
            >
              Prev
            </button>
            <button
              type="button"
              disabled={loadingList || items.length < filters.limit}
              className={buttonClassNames("secondary")}
              onClick={() =>
                setFilters((s) => ({
                  ...s,
                  offset: s.offset + s.limit,
                }))
              }
            >
              Next
            </button>
            <span className="text-sm text-gray-600">
              offset {filters.offset}, limit {filters.limit}
            </span>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Detail</h2>
          {detailId == null ? (
            <EmptyState
              title="No row selected"
              message="Pick a recommendation from the list to inspect fields, metrics, and related alerts."
            />
          ) : loadingDetail ? (
            <LoadingState message="Loading recommendation detail…" />
          ) : detailError ? (
            <p className="text-sm text-red-700">{detailError}</p>
          ) : !detail ? (
            <p className="text-sm text-gray-600">No detail.</p>
          ) : (
            <DetailPanel
              detail={detail}
              actionLoadingId={actionLoadingId}
              onAccept={() => void runRowAction(detail.id, "accept")}
              onDismiss={() => void runRowAction(detail.id, "dismiss")}
              onResolve={() => void runRowAction(detail.id, "resolve")}
            />
          )}
        </section>
      </div>

      {!loadingPrerequisites && alertsSummary && alertsSummary.open_total === 0 ? (
        <section className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
          <p className="font-medium">No open alerts</p>
          <p className="mt-1">
            Recommendations are built from alert context.{" "}
            <Link href="/app/alerts" className="font-medium text-blue-800 underline">
              Run alerts
            </Link>{" "}
            for your as-of date before expecting rich AI output.
          </p>
        </section>
      ) : null}
    </main>
  );
}

function DetailPanel({
  detail,
  actionLoadingId,
  onAccept,
  onDismiss,
  onResolve,
}: {
  detail: RecommendationDetail;
  actionLoadingId: number | null;
  onAccept: () => void;
  onDismiss: () => void;
  onResolve: () => void;
}) {
  const validationWarnings = extractValidationWarnings(detail);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge level={detail.priority_level} />
        <HorizonBadge horizon={detail.horizon} />
        <ConfidenceBadge level={detail.confidence_level} />
        <UrgencyBadge urgency={detail.urgency} />
        <StatusBadge status={detail.status} />
        <span className="text-xs text-gray-500">id {detail.id}</span>
      </div>

      {validationWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <h3 className="font-semibold text-amber-950">Validation warnings</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-950">
            {validationWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.status === "open" ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs text-gray-600">Actions only change recommendation status in this MVP.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actionLoadingId === detail.id}
              className={buttonClassNames("primary")}
              onClick={onAccept}
            >
              {actionLoadingId === detail.id ? "Working…" : "Accept"}
            </button>
            <button
              type="button"
              disabled={actionLoadingId === detail.id}
              className={buttonClassNames("secondary")}
              onClick={onDismiss}
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={actionLoadingId === detail.id}
              className={buttonClassNames("secondary")}
              onClick={onResolve}
            >
              Resolve
            </button>
          </div>
        </div>
      ) : null}

      <section>
        <h3 className="font-semibold text-gray-900">What happened</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.what_happened}</p>
      </section>
      <section>
        <h3 className="font-semibold text-gray-900">Why it matters</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.why_it_matters}</p>
      </section>
      <section>
        <h3 className="font-semibold text-gray-900">Recommended action</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.recommended_action}</p>
      </section>
      <section>
        <h3 className="font-semibold text-gray-900">Expected effect</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.expected_effect ?? "—"}</p>
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Priority score</h3>
          <p className="text-gray-900">{detail.priority_score.toFixed(1)}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">AI</h3>
          <p className="text-gray-900">model {detail.ai_model ?? "—"}</p>
          <p className="text-gray-900">prompt {detail.ai_prompt_version ?? "—"}</p>
        </div>
      </div>
      <section>
        <h3 className="font-semibold text-gray-900">Timestamps</h3>
        <ul className="mt-1 list-inside list-disc text-gray-800">
          <li>first_seen_at: {fmtDate(detail.first_seen_at)}</li>
          <li>last_seen_at: {fmtDate(detail.last_seen_at)}</li>
          <li>accepted_at: {fmtDate(detail.accepted_at)}</li>
          <li>dismissed_at: {fmtDate(detail.dismissed_at)}</li>
          <li>resolved_at: {fmtDate(detail.resolved_at)}</li>
        </ul>
      </section>
      <section>
        <h3 className="font-semibold text-gray-900">Supporting metrics</h3>
        <JsonBlock value={detail.supporting_metrics_payload} emptyLabel="No supporting metrics." />
      </section>
      <section>
        <h3 className="font-semibold text-gray-900">Constraints checked</h3>
        <ConstraintHints payload={detail.constraints_payload} />
        <JsonBlock value={detail.constraints_payload} emptyLabel="No constraints payload." />
      </section>
      <section>
        <h3 className="mb-2 font-semibold text-gray-900">Related alerts</h3>
        <p className="mb-2 text-xs">
          <Link href="/app/alerts" className="text-blue-700 underline">
            Open Alerts screen
          </Link>
        </p>
        {!detail.related_alerts || detail.related_alerts.length === 0 ? (
          <p className="text-gray-600">No linked alerts.</p>
        ) : (
          <ul className="space-y-3">
            {detail.related_alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge label={a.severity} />
                  <Badge label={a.urgency} />
                  <span className="text-gray-700">{a.alert_group}</span>
                  <span className="font-mono text-gray-700">{a.alert_type}</span>
                </div>
                <p className="mt-1 font-medium">{a.title}</p>
                <p className="text-gray-800">{a.message}</p>
                <p className="mt-1 text-xs text-gray-600">entity: {fmtEntityRec(a)}</p>
                <p className="text-xs text-gray-600">status={a.status}, last_seen={fmtDate(a.last_seen_at)}</p>
                <Link
                  href={`/app/alerts?focusAlertId=${encodeURIComponent(String(a.id))}`}
                  className="mt-2 inline-block text-xs font-medium text-blue-700 underline"
                >
                  View in Alerts (#{a.id})
                </Link>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-blue-800">Evidence payload (JSON)</summary>
                  <JsonBlock value={a.evidence_payload} emptyLabel="No evidence payload." />
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="rounded-lg border border-gray-200 bg-gray-50 p-2">
        <summary className="cursor-pointer font-medium text-gray-800">Raw AI response</summary>
        {detail.raw_ai_response === undefined || detail.raw_ai_response === null ? (
          <p className="mt-2 text-sm text-gray-600">No raw AI response.</p>
        ) : isEmptyJsonish(detail.raw_ai_response) ? (
          <p className="mt-2 text-sm text-gray-600">Empty raw AI response.</p>
        ) : (
          <RawAIBlock value={detail.raw_ai_response} />
        )}
      </details>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s === "completed" || s === "success" || s === "succeeded"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : s === "failed" || s === "error"
        ? "border-red-300 bg-red-50 text-red-900"
        : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s === "open"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : s === "accepted"
        ? "border-blue-300 bg-blue-50 text-blue-900"
        : s === "dismissed"
          ? "border-gray-300 bg-gray-100 text-gray-800"
          : s === "resolved"
            ? "border-violet-300 bg-violet-50 text-violet-900"
            : "border-gray-200 bg-white text-gray-800";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
  );
}

function PriorityBadge({ level }: { level: string }) {
  const tone =
    level === "critical"
      ? "border-red-400 bg-red-50 text-red-900"
      : level === "high"
        ? "border-orange-400 bg-orange-50 text-orange-900"
        : level === "medium"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-slate-300 bg-slate-50 text-slate-800";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{level}</span>
  );
}

function HorizonBadge({ horizon }: { horizon: string }) {
  return (
    <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-900">
      {horizon.replaceAll("_", " ")}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-900">
      conf: {level}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span className="inline-flex rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-800">
      urgency: {urgency.replaceAll("_", " ")}
    </span>
  );
}

function ConstraintHints({ payload }: { payload: Record<string, unknown> }) {
  const keys = payload && typeof payload === "object" ? Object.keys(payload) : [];
  if (keys.length === 0) return null;
  const has = (sub: string) => keys.some((k) => k.toLowerCase().includes(sub));
  const bits: string[] = [];
  if (has("pric") || has("margin")) bits.push("pricing / margin fields present");
  if (has("stock")) bits.push("stock risk fields present");
  if (has("ad") || has("campaign")) bits.push("advertising fields present");
  if (bits.length === 0) return null;
  return <p className="mb-1 text-xs text-gray-600">{bits.join(" · ")}</p>;
}

function JsonBlock({ value, emptyLabel }: { value: unknown; emptyLabel?: string }) {
  if (isEmptyJsonish(value)) {
    return <p className="text-gray-600">{emptyLabel ?? "(empty)"}</p>;
  }
  return (
    <pre className="mt-1 max-h-64 overflow-auto rounded border bg-white p-2 text-xs break-words whitespace-pre-wrap">
      {stringifyJsonish(value)}
    </pre>
  );
}

function RawAIBlock({ value }: { value: unknown }) {
  if (isEmptyJsonish(value)) {
    return <p className="mt-2 text-sm text-gray-600">Empty raw AI response.</p>;
  }
  return (
    <pre className="mt-2 max-h-96 overflow-auto rounded border bg-white p-2 text-xs break-words whitespace-pre-wrap">
      {stringifyJsonish(value)}
    </pre>
  );
}

function isEmptyJsonish(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "object" && !Array.isArray(v)) {
    return Object.keys(v as object).length === 0;
  }
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function stringifyJsonish(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </article>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-gray-700">{label}</span>
      <select className="w-full rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v || "all"} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="inline-flex rounded border px-2 py-0.5 text-xs">{label}</span>;
}
