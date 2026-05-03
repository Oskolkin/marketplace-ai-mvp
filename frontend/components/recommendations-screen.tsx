"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
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

export default function RecommendationsScreen() {
  const [summary, setSummary] = useState<RecommendationsSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
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

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const s = await getRecommendationsSummary();
      setSummary(s);
    } catch (e: unknown) {
      setSummary(null);
      setSummaryError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoadingSummary(false);
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
    void loadSummary();
  }, [loadSummary]);

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
    await Promise.all([loadSummary(), loadList()]);
    if (detailId != null) {
      try {
        const d = await getRecommendationDetail(detailId);
        setDetail(d);
        setDetailError(null);
      } catch (e: unknown) {
        setDetailError(e instanceof Error ? e.message : "Failed to refresh detail");
      }
    }
  }, [detailId, loadList, loadSummary]);

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
      setGenerateMessage(
        `Run #${res.run_id}: generated ${res.generated_total}, valid ${res.valid_total}, rejected ${res.rejected_total}, saved ${res.upserted_total}, linked alerts ${res.linked_alerts_total}, warnings ${res.warnings_total}. Tokens in/out/total: ${res.input_tokens} / ${res.output_tokens} / ${res.total_tokens}.`,
      );
      await refreshAll();
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Generate failed");
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
      await Promise.all([loadSummary(), loadList()]);
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

  const typeSelectOptions = useMemo((): [string, string][] => {
    const rows: [string, string][] = MVP_RECOMMENDATION_TYPES.map((t) => [t, t]);
    return [["", "all"], ...rows];
  }, []);

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Recommendations</h1>
        <p className="mt-1 text-sm text-gray-600">
          AI-generated recommendations for your seller account. Actions only change recommendation status; they do not
          modify prices, ads, or stock.
        </p>
      </header>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Summary</h2>
        {summaryError ? <p className="mb-2 text-sm text-red-700">{summaryError}</p> : null}
        {loadingSummary ? (
          <p className="text-sm">Loading summary...</p>
        ) : !summary ? (
          <p className="text-sm text-gray-600">No summary data.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              <SummaryCard label="Open recommendations" value={summary.open_total} />
              <SummaryCard label="Critical" value={summary.by_priority.critical} />
              <SummaryCard label="High" value={summary.by_priority.high} />
              <SummaryCard label="Medium" value={summary.by_priority.medium} />
              <SummaryCard label="Low" value={summary.by_priority.low} />
              <SummaryCard label="Confidence: high" value={summary.by_confidence.high} />
              <SummaryCard label="Confidence: medium" value={summary.by_confidence.medium} />
              <SummaryCard label="Confidence: low" value={summary.by_confidence.low} />
            </div>
            <div className="rounded border bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium">Latest recommendation run</p>
              {!summary.latest_run ? (
                <p className="text-gray-600">No runs yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
                  <p>
                    status=<b>{summary.latest_run.status}</b>, run_type={summary.latest_run.run_type}
                  </p>
                  <p>as_of_date={summary.latest_run.as_of_date ?? "—"}</p>
                  <p>ai_model={summary.latest_run.ai_model ?? "—"}</p>
                  <p>ai_prompt_version={summary.latest_run.ai_prompt_version ?? "—"}</p>
                  <p>generated_recommendations_count={summary.latest_run.generated_recommendations_count}</p>
                  <p>
                    input_tokens={summary.latest_run.input_tokens}, output_tokens={summary.latest_run.output_tokens},
                    total_tokens={summary.latest_run.total_tokens}
                  </p>
                  <p>estimated_cost={summary.latest_run.estimated_cost}</p>
                  <p>started_at={fmtDate(summary.latest_run.started_at)}</p>
                  <p>finished_at={fmtDate(summary.latest_run.finished_at)}</p>
                  {summary.latest_run.error_message ? (
                    <p className="text-red-700 md:col-span-2">error={summary.latest_run.error_message}</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Generate recommendations</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">as_of_date (optional, YYYY-MM-DD)</span>
            <input
              className="w-48 rounded border px-2 py-1"
              type="date"
              value={generateAsOf}
              onChange={(e) => setGenerateAsOf(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={generateLoading}
            className="rounded border bg-white px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void handleGenerate()}
          >
            {generateLoading ? "Generating…" : "Generate recommendations"}
          </button>
        </div>
        {generateError ? <p className="mt-2 text-sm text-red-700">{generateError}</p> : null}
        {generateMessage ? <p className="mt-2 text-sm text-green-800">{generateMessage}</p> : null}
        {lastGenerateResult ? (
          <pre className="mt-2 overflow-x-auto rounded border bg-white p-2 text-xs text-gray-800">
            {JSON.stringify(lastGenerateResult, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Filters</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
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
            <span className="mb-1 block text-gray-700">Type (free text, overrides preset)</span>
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
      </section>

      {listError ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{listError}</p> : null}
      {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}
      {actionMessage ? <p className="text-sm text-green-800">{actionMessage}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-semibold">Recommendations</h2>
          {loadingList ? (
            <p className="text-sm">Loading recommendations...</p>
          ) : listError ? (
            <p className="text-sm text-gray-600">Could not load the list.</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-600">No recommendations for current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">Priority</th>
                    <th className="px-2 py-2">Conf.</th>
                    <th className="px-2 py-2">Horizon</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Entity</th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Urgency</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Last seen</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        className={`cursor-pointer border-b align-top ${detailId === row.id ? "bg-blue-50" : ""}`}
                        onClick={() => setDetailId(row.id)}
                      >
                        <td className="px-2 py-2">
                          <Badge label={row.priority_level} />
                          <div className="text-xs text-gray-600">{row.priority_score.toFixed(1)}</div>
                        </td>
                        <td className="px-2 py-2">
                          <Badge label={row.confidence_level} />
                        </td>
                        <td className="px-2 py-2">{row.horizon}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.recommendation_type}</td>
                        <td className="px-2 py-2">{fmtEntityRec(row)}</td>
                        <td className="px-2 py-2 font-medium">{row.title}</td>
                        <td className="max-w-xs px-2 py-2 text-gray-800">{row.recommended_action}</td>
                        <td className="px-2 py-2">
                          <Badge label={row.urgency} />
                        </td>
                        <td className="px-2 py-2">
                          <Badge label={row.status} />
                        </td>
                        <td className="px-2 py-2">{fmtDate(row.last_seen_at)}</td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              className="rounded border px-2 py-0.5 text-left hover:bg-gray-50"
                              onClick={() => setDetailId(row.id)}
                            >
                              View details
                            </button>
                            {row.status === "open" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === row.id}
                                  className="rounded border px-2 py-0.5 text-left hover:bg-gray-50 disabled:opacity-50"
                                  onClick={() => void runRowAction(row.id, "accept")}
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === row.id}
                                  className="rounded border px-2 py-0.5 text-left hover:bg-gray-50 disabled:opacity-50"
                                  onClick={() => void runRowAction(row.id, "dismiss")}
                                >
                                  Dismiss
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === row.id}
                                  className="rounded border px-2 py-0.5 text-left hover:bg-gray-50 disabled:opacity-50"
                                  onClick={() => void runRowAction(row.id, "resolve")}
                                >
                                  Resolve
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={filters.offset === 0 || loadingList}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
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
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
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
              offset={filters.offset}, limit={filters.limit}
            </span>
          </div>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-semibold">Detail</h2>
          {detailId == null ? (
            <p className="text-sm text-gray-600">Select a recommendation to view details.</p>
          ) : loadingDetail ? (
            <p className="text-sm">Loading detail...</p>
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
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge label={detail.priority_level} />
        <Badge label={detail.urgency} />
        <Badge label={detail.confidence_level} />
        <span className="text-gray-600">{detail.horizon}</span>
        <span className="text-gray-600">status: {detail.status}</span>
      </div>
      {detail.status === "open" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actionLoadingId === detail.id}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={onAccept}
            >
              {actionLoadingId === detail.id ? "Working…" : "Accept"}
            </button>
            <button
              type="button"
              disabled={actionLoadingId === detail.id}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={onDismiss}
            >
              {actionLoadingId === detail.id ? "Working…" : "Dismiss"}
            </button>
            <button
              type="button"
              disabled={actionLoadingId === detail.id}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={onResolve}
            >
              {actionLoadingId === detail.id ? "Working…" : "Resolve"}
            </button>
          </div>
          <p className="text-xs text-gray-600">
            Accept marks the recommendation as taken into work; it does not change Ozon settings automatically.
          </p>
        </div>
      ) : null}
      <div>
        <h3 className="font-semibold text-gray-800">What happened</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.what_happened}</p>
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">Why it matters</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.why_it_matters}</p>
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">Recommended action</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.recommended_action}</p>
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">Expected effect</h3>
        <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.expected_effect ?? "—"}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      <div>
        <h3 className="font-semibold text-gray-800">Timestamps</h3>
        <ul className="mt-1 list-inside list-disc text-gray-800">
          <li>first_seen_at: {fmtDate(detail.first_seen_at)}</li>
          <li>last_seen_at: {fmtDate(detail.last_seen_at)}</li>
          <li>accepted_at: {fmtDate(detail.accepted_at)}</li>
          <li>dismissed_at: {fmtDate(detail.dismissed_at)}</li>
          <li>resolved_at: {fmtDate(detail.resolved_at)}</li>
        </ul>
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">Supporting metrics</h3>
        <JsonBlock value={detail.supporting_metrics_payload} emptyLabel="No supporting metrics." />
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">Constraints checked</h3>
        <ConstraintHints payload={detail.constraints_payload} />
        <JsonBlock value={detail.constraints_payload} emptyLabel="No constraints payload." />
      </div>
      <div>
        <h3 className="mb-2 font-semibold text-gray-800">Related alerts</h3>
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
              <li key={a.id} className="rounded border bg-gray-50 p-2">
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
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-blue-800">Evidence payload (JSON)</summary>
                  <JsonBlock value={a.evidence_payload} emptyLabel="No evidence payload." />
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="rounded border bg-gray-50 p-2">
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
    <article className="rounded border p-3">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
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
