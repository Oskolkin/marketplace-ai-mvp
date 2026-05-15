"use client";

import { Fragment, useEffect, useState } from "react";
import { buttonClassNames } from "@/components/ui/button";
import {
  dismissAlert,
  getAlerts,
  getAlertsSummary,
  resolveAlert,
  runAlerts,
  type AlertEntityType,
  type AlertGroup,
  type AlertItem,
  type AlertSeverity,
  type AlertsSummaryResponse,
  type AlertStatus,
} from "@/lib/alerts-api";

type FilterState = {
  status: "" | AlertStatus;
  group: "" | AlertGroup;
  severity: "" | AlertSeverity;
  entityType: "" | AlertEntityType;
  limit: number;
  offset: number;
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtEntity(row: AlertItem): string {
  if (row.entity_sku != null) return `SKU ${row.entity_sku}`;
  if (row.entity_offer_id) return `Предложение ${row.entity_offer_id}`;
  if (row.entity_id) return row.entity_id;
  return translateEntityType(row.entity_type);
}

function translateEntityType(t: string): string {
  const m: Record<string, string> = {
    account: "Аккаунт",
    sku: "SKU",
    product: "Товар",
    campaign: "Кампания",
    pricing_constraint: "Ограничение цены",
  };
  return m[t] ?? t;
}

function translateAlertStatus(s: string): string {
  const m: Record<string, string> = {
    open: "Открыто",
    resolved: "Закрыто",
    dismissed: "Отклонено",
  };
  return m[s] ?? s;
}

function translateSeverity(s: string): string {
  const m: Record<string, string> = {
    low: "Низкая",
    medium: "Средняя",
    high: "Высокая",
    critical: "Критическая",
  };
  return m[s] ?? s;
}

function translateAlertGroup(g: string): string {
  const m: Record<string, string> = {
    sales: "Продажи",
    stock: "Склад",
    advertising: "Реклама",
    price_economics: "Цена / экономика",
  };
  return m[g] ?? g;
}

function translateUrgency(u: string): string {
  return u.replaceAll("_", " ");
}

export default function AlertsScreen({ initialFocusAlertId }: { initialFocusAlertId?: number }) {
  const [summary, setSummary] = useState<AlertsSummaryResponse | null>(null);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [focusHighlightId, setFocusHighlightId] = useState<number | null>(null);
  const [focusAlertMissing, setFocusAlertMissing] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    status: "",
    group: "",
    severity: "",
    entityType: "",
    limit: 50,
    offset: 0,
  });

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [runAsOfDate, setRunAsOfDate] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function reloadSummary() {
    try {
      setLoadingSummary(true);
      const data = await getAlertsSummary();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить сводку оповещений");
    } finally {
      setLoadingSummary(false);
    }
  }

  async function reloadList() {
    try {
      setLoadingList(true);
      const data = await getAlerts({
        status: filters.status || undefined,
        group: filters.group || undefined,
        severity: filters.severity || undefined,
        entityType: filters.entityType || undefined,
        limit: filters.limit,
        offset: filters.offset,
      });
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить оповещения");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    setError("");
    void reloadSummary();
    void reloadList();
    // list depends on all filter values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.group, filters.severity, filters.entityType, filters.limit, filters.offset]);

  useEffect(() => {
    if (initialFocusAlertId == null) {
      setFocusHighlightId(null);
      setFocusAlertMissing(false);
      return;
    }
    if (loadingList) {
      return;
    }
    const hit = items.some((a) => a.id === initialFocusAlertId);
    if (hit) {
      setExpanded((prev) => ({ ...prev, [initialFocusAlertId]: true }));
      setFocusHighlightId(initialFocusAlertId);
      setFocusAlertMissing(false);
    } else {
      setFocusHighlightId(null);
      setFocusAlertMissing(true);
    }
  }, [initialFocusAlertId, items, loadingList]);

  useEffect(() => {
    if (focusHighlightId == null || loadingList || typeof document === "undefined") {
      return;
    }
    const el = document.getElementById(`alert-row-${focusHighlightId}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }, [focusHighlightId, loadingList, items]);

  function resetFiltersForFocus() {
    setFilters({
      status: "",
      group: "",
      severity: "",
      entityType: "",
      limit: 50,
      offset: 0,
    });
  }

  async function handleRun() {
    try {
      setRunning(true);
      setError("");
      setStatusMessage("");
      await runAlerts(runAsOfDate ? { as_of_date: runAsOfDate } : undefined);
      setStatusMessage("Запуск движка оповещений завершён.");
      await Promise.all([reloadSummary(), reloadList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить оповещения");
    } finally {
      setRunning(false);
    }
  }

  async function handleDismiss(id: number) {
    try {
      setActionLoadingId(id);
      setError("");
      setStatusMessage("");
      await dismissAlert(id);
      setStatusMessage(`Оповещение ${id} отклонено.`);
      await Promise.all([reloadSummary(), reloadList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отклонить оповещение");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleResolve(id: number) {
    try {
      setActionLoadingId(id);
      setError("");
      setStatusMessage("");
      await resolveAlert(id);
      setStatusMessage(`Оповещение ${id} закрыто.`);
      await Promise.all([reloadSummary(), reloadList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось закрыть оповещение");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Оповещения</h1>
          <p className="text-sm text-gray-600">Сводка, фильтры, доказательства и ручной запуск.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">Дата отчёта as_of_date (необязательно)</span>
            <input
              type="date"
              className="rounded border px-2 py-1"
              value={runAsOfDate}
              onChange={(e) => setRunAsOfDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="rounded border px-3 py-2 hover:bg-gray-50"
          >
            {running ? "Запуск…" : "Запустить оповещения вручную"}
          </button>
        </div>
      </div>

      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      {statusMessage ? (
        <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">{statusMessage}</p>
      ) : null}

      {initialFocusAlertId != null && focusAlertMissing && !loadingList ? (
        <div
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-medium">Выбранное оповещение не в текущем списке</p>
          <p className="mt-1 text-amber-900">
            Оповещение №{initialFocusAlertId} не на этой странице. Его могут скрывать фильтры, оно на другой странице
            или уже недоступно.
          </p>
          <button type="button" className={`${buttonClassNames("secondary")} mt-3`} onClick={resetFiltersForFocus}>
            Сбросить фильтры и пагинацию
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {loadingSummary || !summary ? (
          <div className="col-span-full rounded border p-4 text-sm">Загрузка сводки…</div>
        ) : (
          <>
            <SummaryCard label="Открытые оповещения" value={summary.open_total} />
            <SummaryCard label="Критические" value={summary.critical_count} />
            <SummaryCard label="Высокие" value={summary.high_count} />
            <SummaryCard label="Средние" value={summary.medium_count} />
            <SummaryCard label="Низкие" value={summary.low_count} />
            <SummaryCard label="Продажи" value={summary.by_group.sales} />
            <SummaryCard label="Склад" value={summary.by_group.stock} />
            <SummaryCard label="Реклама" value={summary.by_group.advertising} />
            <SummaryCard label="Цена / экономика" value={summary.by_group.price_economics} />
          </>
        )}
      </section>

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">Последний запуск</h2>
        {loadingSummary || !summary ? (
          <p>Загрузка последнего запуска…</p>
        ) : !summary.latest_run ? (
          <p className="text-gray-600">Запусков пока не было.</p>
        ) : (
          <div className="space-y-1">
            <p>
              статус=<b>{summary.latest_run.status}</b>, тип_запуска={summary.latest_run.run_type}
            </p>
            <p>начало={fmtDate(summary.latest_run.started_at)}</p>
            <p>окончание={fmtDate(summary.latest_run.finished_at)}</p>
            <p>всего_оповещений={summary.latest_run.total_alerts_count}</p>
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Фильтры</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Select
            label="Статус"
            value={filters.status}
            onChange={(v) => setFilters((s) => ({ ...s, status: v as FilterState["status"], offset: 0 }))}
            options={[
              ["", "Все"],
              ["open", "Открыто"],
              ["resolved", "Закрыто"],
              ["dismissed", "Отклонено"],
            ]}
          />
          <Select
            label="Группа"
            value={filters.group}
            onChange={(v) => setFilters((s) => ({ ...s, group: v as FilterState["group"], offset: 0 }))}
            options={[
              ["", "Все"],
              ["sales", "Продажи"],
              ["stock", "Склад"],
              ["advertising", "Реклама"],
              ["price_economics", "Цена / экономика"],
            ]}
          />
          <Select
            label="Важность"
            value={filters.severity}
            onChange={(v) => setFilters((s) => ({ ...s, severity: v as FilterState["severity"], offset: 0 }))}
            options={[
              ["", "Все"],
              ["low", "Низкая"],
              ["medium", "Средняя"],
              ["high", "Высокая"],
              ["critical", "Критическая"],
            ]}
          />
          <Select
            label="Тип сущности"
            value={filters.entityType}
            onChange={(v) => setFilters((s) => ({ ...s, entityType: v as FilterState["entityType"], offset: 0 }))}
            options={[
              ["", "Все"],
              ["account", "Аккаунт"],
              ["sku", "SKU"],
              ["product", "Товар"],
              ["campaign", "Кампания"],
              ["pricing_constraint", "Ограничение цены"],
            ]}
          />
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">Лимит</span>
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              min={1}
              max={200}
              value={filters.limit}
              onChange={(e) =>
                setFilters((s) => ({
                  ...s,
                  limit: Math.max(1, Math.min(200, Number(e.target.value) || 50)),
                  offset: 0,
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Список оповещений</h2>
        {loadingList ? (
          <p className="text-sm">Загрузка оповещений…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-600">Нет оповещений по текущим фильтрам.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Важность</th>
                  <th className="px-2 py-2">Срочность</th>
                  <th className="px-2 py-2">Группа</th>
                  <th className="px-2 py-2">Заголовок</th>
                  <th className="px-2 py-2">Сущность</th>
                  <th className="px-2 py-2">Сообщение</th>
                  <th className="px-2 py-2">Последний раз</th>
                  <th className="px-2 py-2">Статус</th>
                  <th className="px-2 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      id={`alert-row-${row.id}`}
                      className={`border-b align-top ${
                        focusHighlightId === row.id ? "bg-amber-50/80 ring-2 ring-amber-400/90 ring-inset" : ""
                      }`}
                    >
                      <td className="px-2 py-2">
                        <Badge label={translateSeverity(row.severity)} />
                      </td>
                      <td className="px-2 py-2">
                        <Badge label={translateUrgency(row.urgency)} />
                      </td>
                      <td className="px-2 py-2">{translateAlertGroup(row.alert_group)}</td>
                      <td className="px-2 py-2 font-medium">{row.title}</td>
                      <td className="px-2 py-2">{fmtEntity(row)}</td>
                      <td className="px-2 py-2">{row.message}</td>
                      <td className="px-2 py-2">{fmtDate(row.last_seen_at)}</td>
                      <td className="px-2 py-2">{translateAlertStatus(row.status)}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            className="rounded border px-2 py-1 hover:bg-gray-50"
                            onClick={() => handleDismiss(row.id)}
                          >
                            Отклонить
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            className="rounded border px-2 py-1 hover:bg-gray-50"
                            onClick={() => handleResolve(row.id)}
                          >
                            Закрыть
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 hover:bg-gray-50"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [row.id]: !prev[row.id],
                              }))
                            }
                          >
                            {expanded[row.id] ? "Скрыть доказательства" : "Показать доказательства"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded[row.id] ? (
                      <tr className="border-b">
                        <td colSpan={9} className="bg-gray-50 px-2 py-2">
                          <p className="mb-2 text-xs text-gray-600">
                            метрика={String(row.evidence_payload?.metric ?? "—")}
                          </p>
                          {row.evidence_payload && Object.keys(row.evidence_payload).length > 0 ? (
                            <pre className="overflow-x-auto rounded border bg-white p-2 text-xs">
                              {JSON.stringify(row.evidence_payload, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-gray-600">Нет данных доказательств.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
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
            Назад
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
            Вперёд
          </button>
          <span className="text-sm text-gray-600">смещение={filters.offset}, лимит={filters.limit}</span>
        </div>
      </section>
    </main>
  );
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
