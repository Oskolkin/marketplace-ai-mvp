"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClassNames } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getDashboardSKUTable,
  getDashboardStocks,
  getDashboardSummary,
  getCriticalSKUs,
  getStocksReplenishment,
  getAdvertisingAnalytics,
  type DashboardSkuRow,
  type DashboardStockRow,
  type DashboardSummaryResponse,
  type CriticalSKUItem,
  type StocksReplenishmentItem,
  type AdvertisingAnalyticsResponse,
} from "@/lib/analytics-api";
import {
  getAlerts,
  getAlertsSummary,
  type AlertItem,
  type AlertsSummaryResponse,
} from "@/lib/alerts-api";
import {
  getRecommendations,
  getRecommendationsSummary,
  type RecommendationItem,
  type RecommendationsSummary,
} from "@/lib/recommendations-api";

// Dashboard intentionally uses small limits and precomputed analytics/alerts/recommendations.
// Do not load raw orders/products/ad metrics here.
const DASHBOARD_RECOMMENDATIONS_LIMIT = 5;
const DASHBOARD_ALERTS_LIMIT = 5;
const DASHBOARD_CRITICAL_SKU_LIMIT = 5;
const DASHBOARD_STOCK_RISKS_LIMIT = 5;
const DASHBOARD_AD_RISKS_LIMIT = 5;
const DASHBOARD_PRICING_RISKS_LIMIT = 5;
const DASHBOARD_TOP_CHANGES_LIMIT = 5;
const DASHBOARD_TOP_CHANGES_ALERTS_LIMIT = 10;
const DASHBOARD_TABLE_LIMIT = 20;

async function fetchOpenRecommendationsByPriority(): Promise<RecommendationItem[]> {
  const critical = await getRecommendations({
    status: "open",
    priority_level: "critical",
    limit: DASHBOARD_RECOMMENDATIONS_LIMIT,
    offset: 0,
  });
  let items = critical.items ?? [];
  if (items.length > 0) return items;
  const high = await getRecommendations({
    status: "open",
    priority_level: "high",
    limit: DASHBOARD_RECOMMENDATIONS_LIMIT,
    offset: 0,
  });
  items = high.items ?? [];
  if (items.length > 0) return items;
  const medium = await getRecommendations({
    status: "open",
    priority_level: "medium",
    limit: DASHBOARD_RECOMMENDATIONS_LIMIT,
    offset: 0,
  });
  return medium.items ?? [];
}

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtNum(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtDeltaPct(pct: number | null): string {
  if (pct == null) return "н/д";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatEntityLabel(
  row: Pick<RecommendationItem, "entity_sku" | "entity_offer_id" | "entity_id" | "entity_type">,
): string {
  if (row.entity_sku != null) return `SKU: ${row.entity_sku}`;
  if (row.entity_offer_id) return `Артикул: ${row.entity_offer_id}`;
  if (row.entity_id) return `ID: ${row.entity_id}`;
  return row.entity_type;
}

function formatRunLine(run: RecommendationsSummary["latest_run"]): string {
  if (!run) return "";
  const parts = [
    `статус ${run.status}`,
    run.ai_model ? `модель ${run.ai_model}` : null,
    run.ai_prompt_version ? `промпт ${run.ai_prompt_version}` : null,
    `создано ${run.generated_recommendations_count}`,
    `начато ${fmtDateTime(run.started_at)}`,
    `завершено ${fmtDateTime(run.finished_at)}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function priorityLabel(value: string): string {
  const key = value.toLowerCase();
  const map: Record<string, string> = {
    critical: "Критический",
    high: "Высокий",
    medium: "Средний",
    low: "Низкий",
  };
  if (map[key]) return map[key];
  return value.replaceAll("_", " ");
}

function isLikelyAdsPerformanceTokenIssue(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("performance") ||
    m.includes("token") ||
    m.includes("bearer") ||
    m.includes("401") ||
    m.includes("403") ||
    m.includes("unauthorized") ||
    m.includes("forbidden")
  );
}

function formatCriticalSkuEntity(item: CriticalSKUItem): string {
  if (item.sku != null) return `SKU: ${item.sku}`;
  if (item.offer_id) return `Артикул: ${item.offer_id}`;
  if (item.ozon_product_id != null) return `Товар: ${item.ozon_product_id}`;
  return "Сущность: нет данных";
}

function buildCriticalSkuReason(item: CriticalSKUItem): string {
  const firstSignal = item.signals?.[0];
  if (firstSignal) return firstSignal;
  if ((item.days_of_cover ?? Number.POSITIVE_INFINITY) <= 3 || item.stock_available <= 3) {
    return "Низкий остаток / мало дней покрытия";
  }
  if (item.problem_score >= 70) return "Высокий индекс проблемы";
  if (item.revenue > 0 || item.sales_ops > 0) return "Существенное влияние на выручку";
  return "Требует внимания";
}

function formatStockRiskEntity(item: StocksReplenishmentItem): string {
  if (item.sku != null) return `SKU: ${item.sku}`;
  if (item.offer_id) return `Артикул: ${item.offer_id}`;
  if (item.ozon_product_id != null) return `Товар: ${item.ozon_product_id}`;
  return "Сущность: нет данных";
}

function formatStockRiskReason(item: StocksReplenishmentItem): string {
  if (item.current_available_stock <= 0) return "Нет в наличии";
  if ((item.days_of_cover ?? Number.POSITIVE_INFINITY) <= 3) return "Критическое покрытие";
  if ((item.days_of_cover ?? Number.POSITIVE_INFINITY) <= 7) return "Низкое покрытие";
  if (item.replenishment_priority === "critical" || item.replenishment_priority === "high") {
    return "Высокий приоритет пополнения";
  }
  return "Риск по остаткам";
}

function priorityRank(priority: string): number {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function selectTopStockRisks(
  items: StocksReplenishmentItem[],
  limit = DASHBOARD_STOCK_RISKS_LIMIT,
): StocksReplenishmentItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aOut = a.item.current_available_stock <= 0 ? 0 : 1;
      const bOut = b.item.current_available_stock <= 0 ? 0 : 1;
      if (aOut !== bOut) return aOut - bOut;

      const aCover = a.item.days_of_cover ?? Number.POSITIVE_INFINITY;
      const bCover = b.item.days_of_cover ?? Number.POSITIVE_INFINITY;
      if (aCover !== bCover) return aCover - bCover;

      const aPriority = priorityRank(a.item.replenishment_priority);
      const bPriority = priorityRank(b.item.replenishment_priority);
      if (aPriority !== bPriority) return aPriority - bPriority;

      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

type AdRiskRow = {
  title: string;
  campaignLabel: string;
  spend: number;
  revenue: number;
  orders: number;
  roas: number | null;
  reason: string;
  lowStockFlag: boolean;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNum(obj[key]);
    if (value != null) return value;
  }
  return null;
}

function getStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = toStr(obj[key]);
    if (value) return value;
  }
  return null;
}

function getArray(obj: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const raw = obj[key];
    if (!Array.isArray(raw)) continue;
    return raw
      .map((entry) => toRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry != null);
  }
  return [];
}

function computeRoas(row: Record<string, unknown>, revenue: number, spend: number): number | null {
  const existing = getNum(row, ["roas", "roas_value", "roas_ratio"]);
  if (existing != null) return existing;
  if (spend <= 0) return null;
  return revenue / spend;
}

function formatAdRiskReason(
  spend: number,
  revenue: number,
  orders: number,
  roas: number | null,
  lowStockFlag: boolean,
): string {
  if (spend > 0 && revenue <= 0) return "Расход без результата";
  if (spend > 0 && orders <= 0) return "Нет заказов";
  if (roas != null && roas < 1) return "Слабый ROAS";
  if (lowStockFlag) return "Рекламируемый SKU с низким остатком";
  if (spend > 0) return "Высокий расход";
  return "Риск по рекламе";
}

function toAdRiskRow(row: Record<string, unknown>): AdRiskRow {
  const spend = getNum(row, ["spend_total", "spend", "total_spend", "ad_spend", "cost"]) ?? 0;
  const revenue = getNum(row, ["revenue_total", "revenue", "attributed_revenue", "sales_revenue"]) ?? 0;
  const orders = getNum(row, ["orders_total", "orders", "orders_count", "attributed_orders"]) ?? 0;
  const roas = computeRoas(row, revenue, spend);
  const daysOfCover = getNum(row, ["days_of_cover", "stock_days_of_cover"]);
  const lowStockFlag =
    row.low_stock === true ||
    row.low_stock_flag === true ||
    row.stock_risk === true ||
    (daysOfCover != null && daysOfCover <= 3);
  const title =
    getStr(row, ["campaign_name", "name", "title", "product_name", "sku_name"]) ?? "Рекламная сущность";
  const campaignName = getStr(row, ["campaign_name", "campaign_title", "campaign"]);
  const campaignIdStr = getStr(row, ["campaign_id", "external_campaign_id", "id"]);
  const campaignIdNum = getNum(row, ["campaign_external_id"]);
  const campaignId =
    campaignIdStr ?? (campaignIdNum != null ? String(Math.trunc(campaignIdNum)) : null);
  const sku = getStr(row, ["sku", "entity_sku"]);
  const offerId = getStr(row, ["offer_id", "entity_offer_id"]);
  const campaignLabel = campaignName
    ? `${campaignName}${campaignId ? ` (${campaignId})` : ""}`
    : campaignId
      ? `Кампания ${campaignId}`
      : sku
        ? `SKU: ${sku}`
        : offerId
          ? `Артикул: ${offerId}`
          : "Кампания: нет данных";

  return {
    title,
    campaignLabel,
    spend,
    revenue,
    orders,
    roas,
    lowStockFlag,
    reason: formatAdRiskReason(spend, revenue, orders, roas, lowStockFlag),
  };
}

function selectTopAdRisks(
  response: AdvertisingAnalyticsResponse,
  limit = DASHBOARD_AD_RISKS_LIMIT,
): AdRiskRow[] {
  const root = toRecord(response) ?? {};
  const summary = toRecord(root.summary ?? null);
  const candidates = [
    ...getArray(root, ["items", "campaigns", "risks", "sku_risks", "top_risks"]),
    ...getArray(summary ?? {}, ["top_risks", "campaigns", "items", "risks"]),
  ];

  return candidates
    .map(toAdRiskRow)
    .filter((row) => row.spend > 0 || row.orders > 0 || row.revenue > 0)
    .sort((a, b) => {
      const aSeverity = a.spend > 0 && (a.orders <= 0 || a.revenue <= 0) ? 0 : a.roas != null && a.roas < 1 ? 1 : 2;
      const bSeverity = b.spend > 0 && (b.orders <= 0 || b.revenue <= 0) ? 0 : b.roas != null && b.roas < 1 ? 1 : 2;
      if (aSeverity !== bSeverity) return aSeverity - bSeverity;
      if (a.spend !== b.spend) return b.spend - a.spend;
      if (a.orders !== b.orders) return a.orders - b.orders;
      return a.revenue - b.revenue;
    })
    .slice(0, limit);
}

function summarizeAdRisks(response: AdvertisingAnalyticsResponse, rows: AdRiskRow[]) {
  const root = toRecord(response) ?? {};
  const summary = toRecord(root.summary ?? null) ?? {};
  const totalSpend =
    getNum(summary, ["total_spend", "spend", "ad_spend"]) ??
    rows.reduce((acc, row) => acc + row.spend, 0);
  const weakCampaigns =
    getNum(summary, ["weak_campaigns_count", "weak_campaigns", "low_efficiency_campaigns_count"]) ??
    rows.filter((row) => row.roas != null && row.roas < 1).length;
  const spendWithoutResult =
    getNum(summary, ["spend_without_result_count", "zero_result_campaigns_count"]) ??
    rows.filter((row) => row.spend > 0 && (row.orders <= 0 || row.revenue <= 0)).length;
  const lowStockAdvertisedSkus =
    getNum(summary, ["low_stock_advertised_skus_count", "low_stock_skus_count"]) ??
    rows.filter((row) => row.lowStockFlag).length;

  return { totalSpend, weakCampaigns, spendWithoutResult, lowStockAdvertisedSkus };
}

function formatAlertEntityLabel(alert: AlertItem): string {
  if (alert.entity_sku != null) return `SKU: ${alert.entity_sku}`;
  if (alert.entity_offer_id) return `Артикул: ${alert.entity_offer_id}`;
  if (alert.entity_id) return `ID: ${alert.entity_id}`;
  return alert.entity_type;
}

function formatPricingEvidenceSummary(alert: AlertItem): string | null {
  const evidence = alert.evidence_payload;
  if (!evidence || typeof evidence !== "object") return null;
  const record = evidence as Record<string, unknown>;
  const currentPrice = toNum(record.current_price);
  const minPrice = toNum(record.effective_min_price);
  const maxPrice = toNum(record.effective_max_price);
  const expectedMargin = toNum(record.expected_margin);
  const thresholdMargin = toNum(record.threshold_margin);
  const skuRevenue = toNum(record.sku_revenue_for_period);
  const ordersCount = toNum(record.orders_count);

  if (currentPrice != null && minPrice != null) {
    return `Текущая цена ${fmtMoney(currentPrice)} · Мин. ${fmtMoney(minPrice)}`;
  }
  if (currentPrice != null && maxPrice != null) {
    return `Текущая цена ${fmtMoney(currentPrice)} · Макс. ${fmtMoney(maxPrice)}`;
  }
  if (expectedMargin != null && thresholdMargin != null) {
    return `Ожидаемая маржа ${(expectedMargin * 100).toFixed(1)}% · Порог ${(thresholdMargin * 100).toFixed(1)}%`;
  }
  if (skuRevenue != null || ordersCount != null) {
    return `Выручка ${fmtMoney(skuRevenue ?? 0)} · Заказы ${fmtNum(ordersCount ?? 0)}`;
  }
  return null;
}

type TopChangeRow = {
  key: string;
  title: string;
  entityLabel: string;
  revenue: number | null;
  orders: number | null;
  contribution: number | null;
  alert: AlertItem | null;
};

function formatTopChangeEntity(row: DashboardSkuRow): string {
  if (row.sku != null) return `SKU: ${row.sku}`;
  if (row.offer_id) return `Артикул: ${row.offer_id}`;
  if (row.ozon_product_id != null) return `Товар: ${row.ozon_product_id}`;
  return "Товар";
}

function alertPriority(alertType: string): number {
  if (alertType === "sku_negative_contribution") return 0;
  if (alertType === "sku_revenue_drop") return 1;
  if (alertType === "sales_revenue_drop") return 2;
  return 3;
}

function selectTopChanges(
  skuRows: DashboardSkuRow[],
  salesAlerts: AlertItem[],
  limit = DASHBOARD_TOP_CHANGES_LIMIT,
): TopChangeRow[] {
  const relevantAlerts = salesAlerts.filter((a) =>
    ["sku_negative_contribution", "sku_revenue_drop", "sales_revenue_drop"].includes(a.alert_type),
  );
  const alertsBySku = new Map<number, AlertItem>();
  const alertsByOffer = new Map<string, AlertItem>();
  const accountAlerts: AlertItem[] = [];

  for (const alert of relevantAlerts) {
    if (alert.entity_sku != null) {
      if (!alertsBySku.has(alert.entity_sku) || alertPriority(alert.alert_type) < alertPriority(alertsBySku.get(alert.entity_sku)!.alert_type)) {
        alertsBySku.set(alert.entity_sku, alert);
      }
      continue;
    }
    if (alert.entity_offer_id) {
      if (!alertsByOffer.has(alert.entity_offer_id) || alertPriority(alert.alert_type) < alertPriority(alertsByOffer.get(alert.entity_offer_id)!.alert_type)) {
        alertsByOffer.set(alert.entity_offer_id, alert);
      }
      continue;
    }
    accountAlerts.push(alert);
  }

  const topSkuRows = [...skuRows]
    .sort((a, b) => {
      const aAlert = (a.sku != null && alertsBySku.has(a.sku)) || (!!a.offer_id && alertsByOffer.has(a.offer_id));
      const bAlert = (b.sku != null && alertsBySku.has(b.sku)) || (!!b.offer_id && alertsByOffer.has(b.offer_id));
      if (aAlert !== bAlert) return aAlert ? -1 : 1;

      const aNegativeContribution = a.contribution_to_revenue_change < 0 ? 0 : 1;
      const bNegativeContribution = b.contribution_to_revenue_change < 0 ? 0 : 1;
      if (aNegativeContribution !== bNegativeContribution) return aNegativeContribution - bNegativeContribution;

      const aContributionMagnitude = Math.abs(a.contribution_to_revenue_change);
      const bContributionMagnitude = Math.abs(b.contribution_to_revenue_change);
      if (aContributionMagnitude !== bContributionMagnitude) return bContributionMagnitude - aContributionMagnitude;

      return b.revenue - a.revenue;
    })
    .slice(0, limit)
    .map<TopChangeRow>((row) => ({
      key: `sku-${row.ozon_product_id}-${row.offer_id ?? ""}-${row.sku ?? ""}`,
      title: row.product_name || "Товар без названия",
      entityLabel: formatTopChangeEntity(row),
      revenue: row.revenue,
      orders: row.orders_count,
      contribution: row.contribution_to_revenue_change,
      alert:
        (row.sku != null ? alertsBySku.get(row.sku) : undefined) ??
        (row.offer_id ? alertsByOffer.get(row.offer_id) : undefined) ??
        null,
    }));

  if (topSkuRows.length >= limit) return topSkuRows;

  const extraAccountRows = accountAlerts
    .sort((a, b) => alertPriority(a.alert_type) - alertPriority(b.alert_type))
    .slice(0, limit - topSkuRows.length)
    .map<TopChangeRow>((alert) => ({
      key: `account-alert-${alert.id}`,
      title: alert.title,
      entityLabel: "Аккаунт",
      revenue: null,
      orders: null,
      contribution: null,
      alert,
    }));

  return [...topSkuRows, ...extraAccountRows];
}

type DashboardState = {
  summary: DashboardSummaryResponse | null;
  skuRows: DashboardSkuRow[];
  stocksRows: DashboardStockRow[];
  criticalSkuRows: CriticalSKUItem[];
  stockRiskRows: StocksReplenishmentItem[];
  adRiskRows: AdRiskRow[];
  adRiskSummary: {
    totalSpend: number;
    weakCampaigns: number;
    spendWithoutResult: number;
    lowStockAdvertisedSkus: number;
  } | null;
  pricingRiskRows: AlertItem[];
  topChangeAlerts: AlertItem[];
  alertsSummary: AlertsSummaryResponse | null;
  topAlerts: AlertItem[];
  recSummary: RecommendationsSummary | null;
  topRecommendations: RecommendationItem[];
};

type TodayActionPanel =
  | { mode: "recommendations"; items: RecommendationItem[] }
  | { mode: "alerts"; items: AlertItem[] }
  | { mode: "inventory"; critical: CriticalSKUItem[]; stock: StocksReplenishmentItem[] }
  | { mode: "empty" };

function buildTodaysActionPanel(
  state: DashboardState,
  flags: {
    recListLoading: boolean;
    recListError: string;
    alertsLoading: boolean;
    alertsError: string;
    criticalSkusLoading: boolean;
    criticalSkusError: string;
    stockRisksLoading: boolean;
    stockRisksError: string;
  },
): TodayActionPanel {
  if (!flags.recListLoading && !flags.recListError && state.topRecommendations.length > 0) {
    return { mode: "recommendations", items: state.topRecommendations };
  }
  if (!flags.alertsLoading && !flags.alertsError && state.topAlerts.length > 0) {
    return { mode: "alerts", items: state.topAlerts };
  }
  const critical =
    !flags.criticalSkusLoading && !flags.criticalSkusError
      ? state.criticalSkuRows.slice(0, 4)
      : [];
  const stock =
    !flags.stockRisksLoading && !flags.stockRisksError ? state.stockRiskRows.slice(0, 4) : [];
  if (critical.length > 0 || stock.length > 0) {
    return { mode: "inventory", critical, stock };
  }
  return { mode: "empty" };
}

type DashboardScreenProps = {
  initialAsOfDate?: string;
};

export default function DashboardScreen({ initialAsOfDate }: DashboardScreenProps) {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    skuRows: [],
    stocksRows: [],
    criticalSkuRows: [],
    stockRiskRows: [],
    adRiskRows: [],
    adRiskSummary: null,
    pricingRiskRows: [],
    topChangeAlerts: [],
    alertsSummary: null,
    topAlerts: [],
    recSummary: null,
    topRecommendations: [],
  });
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState("");
  const [recSummaryLoading, setRecSummaryLoading] = useState(true);
  const [recSummaryError, setRecSummaryError] = useState("");
  const [recListLoading, setRecListLoading] = useState(true);
  const [recListError, setRecListError] = useState("");
  const [criticalSkusLoading, setCriticalSkusLoading] = useState(true);
  const [criticalSkusError, setCriticalSkusError] = useState("");
  const [stockRisksLoading, setStockRisksLoading] = useState(true);
  const [stockRisksError, setStockRisksError] = useState("");
  const [adRisksLoading, setAdRisksLoading] = useState(true);
  const [adRisksError, setAdRisksError] = useState("");
  const [pricingRisksLoading, setPricingRisksLoading] = useState(true);
  const [pricingRisksError, setPricingRisksError] = useState("");
  const [topChangesLoading, setTopChangesLoading] = useState(true);
  const [topChangesError, setTopChangesError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        setAlertsLoading(true);
        setAlertsError("");
        setRecSummaryLoading(true);
        setRecListLoading(true);
        setRecSummaryError("");
        setRecListError("");
        setCriticalSkusLoading(true);
        setCriticalSkusError("");
        setStockRisksLoading(true);
        setStockRisksError("");
        setAdRisksLoading(true);
        setAdRisksError("");
        setPricingRisksLoading(true);
        setPricingRisksError("");
        setTopChangesLoading(true);
        setTopChangesError("");

        const [summary, skuTable, stocks] = await Promise.all([
          getDashboardSummary(initialAsOfDate),
          getDashboardSKUTable({
            asOfDate: initialAsOfDate,
            limit: DASHBOARD_TABLE_LIMIT,
            offset: 0,
            sortBy: "revenue",
            sortOrder: "desc",
          }),
          getDashboardStocks(),
        ]);

        const safeSkuItems = skuTable?.items ?? [];
        const safeStocksItems = stocks?.items ?? [];

        setState({
          summary,
          skuRows: safeSkuItems.slice(0, DASHBOARD_TABLE_LIMIT),
          stocksRows: safeStocksItems.slice(0, DASHBOARD_TABLE_LIMIT),
          criticalSkuRows: [],
          stockRiskRows: [],
          adRiskRows: [],
          adRiskSummary: null,
          pricingRiskRows: [],
          topChangeAlerts: [],
          alertsSummary: null,
          topAlerts: [],
          recSummary: null,
          topRecommendations: [],
        });
        setLoading(false);

        try {
          const alertsSummary = await getAlertsSummary();
          const criticalAlerts = await getAlerts({
            status: "open",
            severity: "critical",
            limit: DASHBOARD_ALERTS_LIMIT,
            offset: 0,
          });

          let topAlerts = criticalAlerts.items ?? [];
          if (topAlerts.length === 0) {
            const highAlerts = await getAlerts({
              status: "open",
              severity: "high",
              limit: DASHBOARD_ALERTS_LIMIT,
              offset: 0,
            });
            topAlerts = highAlerts.items ?? [];
          }

          setState((prev) => ({
            ...prev,
            alertsSummary,
            topAlerts,
          }));
        } catch (alertsErr) {
          setAlertsError(
            alertsErr instanceof Error ? `Алерты недоступны. ${alertsErr.message}` : "Алерты недоступны.",
          );
        } finally {
          setAlertsLoading(false);
        }

        let recSummary: RecommendationsSummary | null = null;
        let topRecommendations: RecommendationItem[] = [];

        try {
          recSummary = await getRecommendationsSummary();
        } catch (recErr) {
          setRecSummaryError(
            recErr instanceof Error
              ? `Рекомендации недоступны. ${recErr.message}`
              : "Рекомендации недоступны.",
          );
        } finally {
          setRecSummaryLoading(false);
        }

        try {
          topRecommendations = await fetchOpenRecommendationsByPriority();
        } catch (recErr) {
          setRecListError(
            recErr instanceof Error
              ? `Рекомендации недоступны. ${recErr.message}`
              : "Рекомендации недоступны.",
          );
        } finally {
          setRecListLoading(false);
        }

        setState((prev) => ({
          ...prev,
          recSummary,
          topRecommendations,
        }));

        try {
          const criticalSkuResponse = await getCriticalSKUs({
            asOfDate: initialAsOfDate,
            limit: DASHBOARD_CRITICAL_SKU_LIMIT,
            offset: 0,
            sortBy: "problem_score",
            sortOrder: "desc",
          });
          setState((prev) => ({
            ...prev,
            criticalSkuRows: (criticalSkuResponse.items ?? []).slice(0, DASHBOARD_CRITICAL_SKU_LIMIT),
          }));
        } catch (criticalErr) {
          setCriticalSkusError(
            criticalErr instanceof Error
              ? `Критичные SKU недоступны. ${criticalErr.message}`
              : "Критичные SKU недоступны.",
          );
        } finally {
          setCriticalSkusLoading(false);
        }

        try {
          const stockRiskResponse = await getStocksReplenishment(initialAsOfDate);
          setState((prev) => ({
            ...prev,
            stockRiskRows: selectTopStockRisks(stockRiskResponse.items ?? [], DASHBOARD_STOCK_RISKS_LIMIT),
          }));
        } catch (stockErr) {
          setStockRisksError(
            stockErr instanceof Error
              ? `Риски по остаткам недоступны. ${stockErr.message}`
              : "Риски по остаткам недоступны.",
          );
        } finally {
          setStockRisksLoading(false);
        }

        try {
          const adResponse = await getAdvertisingAnalytics();
          const topAdRisks = selectTopAdRisks(adResponse, DASHBOARD_AD_RISKS_LIMIT);
          const adSummary = summarizeAdRisks(adResponse, topAdRisks);
          setState((prev) => ({
            ...prev,
            adRiskRows: topAdRisks,
            adRiskSummary: adSummary,
          }));
        } catch (adErr) {
          setAdRisksError(
            adErr instanceof Error ? `Риски рекламы недоступны. ${adErr.message}` : "Риски рекламы недоступны.",
          );
        } finally {
          setAdRisksLoading(false);
        }

        try {
          const pricingRisks = await getAlerts({
            status: "open",
            group: "price_economics",
            limit: DASHBOARD_PRICING_RISKS_LIMIT,
            offset: 0,
          });
          setState((prev) => ({
            ...prev,
            pricingRiskRows: (pricingRisks.items ?? []).slice(0, DASHBOARD_PRICING_RISKS_LIMIT),
          }));
        } catch (pricingErr) {
          setPricingRisksError(
            pricingErr instanceof Error
              ? `Риски цен и экономики недоступны. ${pricingErr.message}`
              : "Риски цен и экономики недоступны.",
          );
        } finally {
          setPricingRisksLoading(false);
        }

        try {
          const salesAlerts = await getAlerts({
            status: "open",
            group: "sales",
            limit: DASHBOARD_TOP_CHANGES_ALERTS_LIMIT,
            offset: 0,
          });
          setState((prev) => ({
            ...prev,
            topChangeAlerts: salesAlerts.items ?? [],
          }));
        } catch (salesAlertsErr) {
          setTopChangesError(
            salesAlertsErr instanceof Error
              ? `Алерты «Топ изменений» недоступны. ${salesAlertsErr.message}`
              : "Алерты «Топ изменений» недоступны.",
          );
        } finally {
          setTopChangesLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить дашборд");
        setAlertsError("Алерты недоступны.");
        setRecSummaryError(
          "Рекомендации недоступны."
        );
        setRecListError(
          "Рекомендации недоступны."
        );
        setCriticalSkusError(
          "Критичные SKU недоступны."
        );
        setStockRisksError(
          "Риски по остаткам недоступны."
        );
        setAdRisksError(
          "Риски рекламы недоступны."
        );
        setPricingRisksError(
          "Риски цен и экономики недоступны."
        );
        setTopChangesError(
          "Алерты «Топ изменений» недоступны."
        );
        setRecSummaryLoading(false);
        setRecListLoading(false);
        setCriticalSkusLoading(false);
        setStockRisksLoading(false);
        setAdRisksLoading(false);
        setPricingRisksLoading(false);
        setTopChangesLoading(false);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [initialAsOfDate]);

  if (loading) {
    return (
      <main className="p-6">
        <LoadingState message="Загрузка дашборда…" />
      </main>
    );
  }

  if (!state.summary) {
    return (
      <main className="space-y-4 p-6">
        {error ? (
          <ErrorState
            title="Дашборд недоступен"
            message={error}
            action={
              <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
                Статус синхронизации
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Нет сводки дашборда"
            message="Метрики ещё не готовы. Дождитесь успешной синхронизации Ozon, пересчёта и обновите страницу."
            action={
              <Link href="/app/sync-status" className={buttonClassNames("primary")}>
                Статус синхронизации
              </Link>
            }
          />
        )}
      </main>
    );
  }

  const { kpi, summary } = state.summary;

  const alertsRunFailed =
    !alertsLoading &&
    !alertsError &&
    state.alertsSummary?.latest_run &&
    (state.alertsSummary.latest_run.status?.toLowerCase() === "failed" ||
      Boolean(state.alertsSummary.latest_run.error_message));

  const recRunFailed =
    !recSummaryLoading &&
    !recSummaryError &&
    state.recSummary?.latest_run &&
    (state.recSummary.latest_run.status?.toLowerCase() === "failed" ||
      Boolean(state.recSummary.latest_run.error_message));

  const actionPanel = buildTodaysActionPanel(state, {
    recListLoading,
    recListError,
    alertsLoading,
    alertsError,
    criticalSkusLoading,
    criticalSkusError,
    stockRisksLoading,
    stockRisksError,
  });

  const topChangeRows = selectTopChanges(state.skuRows, state.topChangeAlerts, 5);
  const salesAlertTypeCounts = state.topChangeAlerts.reduce<Record<string, number>>((acc, alert) => {
    if (!["sales_revenue_drop", "sku_revenue_drop", "sku_negative_contribution"].includes(alert.alert_type)) {
      return acc;
    }
    acc[alert.alert_type] = (acc[alert.alert_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-3">
        <PageHeader
          title="Дашборд"
          subtitle="Ежедневный центр: метрики, риски и ИИ-рекомендации."
        />

        <Card className="border-gray-200 bg-gray-50/60">
          <CardContent className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Данные на дату</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {summary.as_of_date
                  ? `${summary.as_of_date}${summary.as_of_date_source ? ` (${summary.as_of_date_source})` : ""}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Последняя успешная синхронизация
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {summary.last_successful_update ? fmtDateTime(summary.last_successful_update) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Алерты: последний запуск
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {alertsLoading
                  ? "Загрузка…"
                  : alertsError || !state.alertsSummary
                    ? "Недоступно"
                    : state.alertsSummary.latest_run
                      ? `${state.alertsSummary.latest_run.status} · ${fmtDateTime(state.alertsSummary.latest_run.finished_at ?? state.alertsSummary.latest_run.started_at)}`
                      : "Запусков ещё не было"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Рекомендации: последний запуск
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {recSummaryLoading
                  ? "Загрузка…"
                  : recSummaryError || !state.recSummary
                    ? "Недоступно"
                    : state.recSummary.latest_run
                      ? `${state.recSummary.latest_run.status} · ${fmtDateTime(state.recSummary.latest_run.finished_at ?? state.recSummary.latest_run.started_at)}`
                      : "Запусков ещё не было"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Актуальность данных</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {summary.data_freshness || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(alertsError || alertsRunFailed) && (
        <Card className="border-amber-300 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Проверьте алерты</CardTitle>
            <CardDescription className="text-amber-900/90">
              {alertsError
                ? "Не удалось загрузить сводку алертов из API."
                : "Последний запуск алертов завершился с ошибкой — откройте раздел «Алерты» за подробностями и при необходимости запустите снова."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app/alerts" className={buttonClassNames("secondary")}>
              Открыть алерты
            </Link>
          </CardContent>
        </Card>
      )}

      {(recSummaryError || recRunFailed || recListError) && (
        <Card className="border-amber-300 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Проверьте рекомендации</CardTitle>
            <CardDescription className="text-amber-900/90">
              {recSummaryError
                ? "Не удалось загрузить сводку рекомендаций."
                : recListError
                  ? "Не удалось загрузить список рекомендаций."
                  : "Последний запуск рекомендаций завершился с ошибкой — откройте раздел для проверки."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app/recommendations" className={buttonClassNames("secondary")}>
              Открыть рекомендации
            </Link>
          </CardContent>
        </Card>
      )}

      {adRisksError ? (
        <Card className="border-amber-300 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Рекламная аналитика недоступна</CardTitle>
            <CardDescription className="text-amber-900/90">
              {isLikelyAdsPerformanceTokenIssue(adRisksError)
                ? "Для метрик рекламы часто нужен токен Performance API. Добавьте или проверьте токен в интеграции Ozon — синхронизация продавца и основные KPI дашборда при этом работают."
                : `${adRisksError}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
              Интеграция Ozon
            </Link>
            <Link href="/app/sync-status" className={buttonClassNames("ghost", "border border-amber-200")}>
              Статус синхронизации
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Выручка"
          value={fmtMoney(kpi.revenue_current)}
          hint={`День ко дню: ${fmtMoney(kpi.revenue_day_to_day_delta.abs)} (${fmtDeltaPct(kpi.revenue_day_to_day_delta.pct)}) · Неделя к неделе: ${fmtMoney(kpi.revenue_week_to_week_delta.abs)} (${fmtDeltaPct(kpi.revenue_week_to_week_delta.pct)})`}
        />
        <MetricCard
          title="Заказы"
          value={fmtNum(kpi.orders_current)}
          hint={`Изменение день ко дню: ${fmtNum(kpi.orders_day_to_day_delta)} заказов (то же окно, что у выручки)`}
        />
        <MetricCard
          title="Возвраты"
          value={fmtNum(kpi.returns_current)}
          hint="Текущий день отчёта — сверяйте с датой «данные на» выше"
        />
        <MetricCard
          title="Отмены"
          value={fmtNum(kpi.cancels_current)}
          hint="Текущий день отчёта — сверяйте с датой «данные на» выше"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Список действий на сегодня</CardTitle>
          <CardDescription>
            Самое важное в MVP: сначала рекомендации, затем алерты, затем сигналы по
            остаткам.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {recListLoading || alertsLoading || criticalSkusLoading || stockRisksLoading ? (
            <p className="text-gray-600">Загрузка действий…</p>
          ) : actionPanel.mode === "recommendations" ? (
            <div className="space-y-2">
              {actionPanel.items.map((r) => (
                <Link
                  href="/app/recommendations"
                  key={r.id}
                  className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:bg-gray-50"
                >
                  <p className="text-xs text-gray-600">
                    <span className="rounded border border-gray-200 px-1.5 py-0.5">
                      {priorityLabel(r.priority_level)}
                    </span>{" "}
                    <span className="rounded border border-gray-200 px-1.5 py-0.5">
                      {priorityLabel(r.confidence_level)}
                    </span>
                  </p>
                  <p className="mt-1 font-medium text-gray-900">{r.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-700">{r.recommended_action}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatEntityLabel(r)}</p>
                </Link>
              ))}
            </div>
          ) : actionPanel.mode === "alerts" ? (
            <div className="space-y-2">
              {actionPanel.items.map((a) => (
                <Link
                  href="/app/alerts"
                  key={a.id}
                  className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:bg-gray-50"
                >
                  <p className="text-xs text-gray-600">
                    {a.severity} · {a.alert_group}
                  </p>
                  <p className="mt-1 font-medium text-gray-900">{a.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-700">{a.message}</p>
                </Link>
              ))}
            </div>
          ) : actionPanel.mode === "inventory" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {actionPanel.critical.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Критичные SKU</p>
                  <div className="space-y-2">
                    {actionPanel.critical.map((item) => (
                      <Link
                        key={`${item.ozon_product_id}-${item.sku ?? ""}`}
                        href="/app/critical-skus"
                        className="block rounded-lg border border-gray-200 bg-white p-2 text-xs hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">
                          {item.product_name || "Товар"}
                        </span>
                        <span className="mt-1 block text-gray-600">{buildCriticalSkuReason(item)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
              {actionPanel.stock.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Риски по остаткам</p>
                  <div className="space-y-2">
                    {actionPanel.stock.map((item) => (
                      <Link
                        key={`${item.ozon_product_id}-${item.sku ?? ""}`}
                        href="/app/stocks-replenishment"
                        className="block rounded-lg border border-gray-200 bg-white p-2 text-xs hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">
                          {item.product_name || "Товар"}
                        </span>
                        <span className="mt-1 block text-gray-600">{formatStockRiskReason(item)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Пока нет приоритетных действий"
              message="Запустите алерты и сгенерируйте рекомендации после синхронизации или откройте соответствующие разделы, когда появятся данные."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                    Запустить алерты
                  </Link>
                  <Link href="/app/recommendations" className={buttonClassNames("primary")}>
                    Сгенерировать рекомендации
                  </Link>
                </div>
              }
            />
          )}
          <p className="border-t border-gray-100 pt-3 text-center text-xs text-gray-600">
            <Link href="/app/recommendations" className="font-medium text-blue-700 underline hover:text-blue-900">
              Все рекомендации
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">Сводка по рекомендациям</CardTitle>
              <CardDescription className="mt-0.5">
                Счётчики и последний запуск — разверните для деталей. Действия остаются в списке на сегодня выше.
              </CardDescription>
            </div>
            <span className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
              <span className="hidden text-gray-500 sm:inline">Развернуть</span>
              <span
                className="inline-block text-gray-400 transition-transform group-open:rotate-90"
                aria-hidden
              >
                ▸
              </span>
              <Link
                href="/app/recommendations"
                className={`${buttonClassNames("secondary")} no-underline`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                Смотреть рекомендации
              </Link>
            </span>
          </summary>
          <CardContent className="space-y-3 border-t border-gray-100 pt-3 text-sm">
            {recSummaryLoading ? (
              <p className="text-sm text-gray-600">Загрузка сводки…</p>
            ) : recSummaryError || recListError || recRunFailed ? (
              <p className="text-sm text-gray-600">См. уведомление о рекомендациях выше.</p>
            ) : !state.recSummary ? (
              <p className="text-sm text-gray-600">Сводка рекомендаций недоступна.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <MetricCard
                    title="Открытые рекомендации"
                    value={fmtNum(state.recSummary.open_total)}
                    hint="Открытые пункты"
                  />
                  <MetricCard
                    title="Критический"
                    value={fmtNum(state.recSummary.by_priority.critical)}
                    hint="По приоритету"
                  />
                  <MetricCard
                    title="Высокий"
                    value={fmtNum(state.recSummary.by_priority.high)}
                    hint="По приоритету"
                  />
                  <MetricCard
                    title="Средний"
                    value={fmtNum(state.recSummary.by_priority.medium)}
                    hint="По приоритету"
                  />
                  <MetricCard
                    title="Статус последнего запуска"
                    value={state.recSummary.latest_run?.status ?? "Нет запуска"}
                    hint={state.recSummary.latest_run ? "Запуск рекомендаций" : "Запусков ещё не было"}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  {state.recSummary.latest_run
                    ? formatRunLine(state.recSummary.latest_run)
                    : "Запусков рекомендаций ещё не было"}
                </p>
              </>
            )}

            {recListLoading ? (
              <p className="text-sm text-gray-600">Загрузка счётчиков…</p>
            ) : recListError || recSummaryError || recRunFailed ? null : state.recSummary?.open_total === 0 ? (
              <EmptyState
                title="Нет открытых рекомендаций"
                message="Сгенерируйте ИИ-рекомендации, когда будут доступны алерты и метрики."
                action={
                  <Link href="/app/recommendations" className={buttonClassNames("primary")}>
                    Сгенерировать рекомендации
                  </Link>
                }
              />
            ) : (
              <p className="text-xs text-gray-600">
                Топ открытых пунктов — в <strong>списке действий на сегодня</strong>.{" "}
                <Link href="/app/recommendations" className="font-medium text-blue-700 underline hover:text-blue-900">
                  Открыть рекомендации
                </Link>{" "}
                для фильтрации, принятия или отклонения.
              </p>
            )}
          </CardContent>
        </details>
      </Card>

      <section className="rounded border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Спросите ИИ о магазине</h2>
            <p className="text-sm text-gray-600">
              Вопросы о продажах, остатках, рекламе, алертах и рекомендациях.
            </p>
          </div>
          <Link href="/app/chat" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Открыть ИИ-чат
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
          <span className="rounded border bg-gray-50 px-2 py-0.5">Какие 5 действий мне сделать сегодня?</span>
          <span className="rounded border bg-gray-50 px-2 py-0.5">Какие товары опасно рекламировать?</span>
          <span className="rounded border bg-gray-50 px-2 py-0.5">Где я теряю деньги из-за рекламы?</span>
        </div>
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Критичные алерты</h2>
            <p className="text-xs text-gray-600">Алерты, требующие внимания.</p>
          </div>
          <Link href="/app/alerts" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Смотреть алерты
          </Link>
        </div>
        {alertsLoading ? (
          <p className="text-sm">Загрузка алертов…</p>
        ) : alertsError || alertsRunFailed ? (
          <p className="text-sm text-gray-600">См. уведомление об алертах вверху страницы.</p>
        ) : !state.alertsSummary ? (
          <p className="text-sm text-gray-600">Сводка алертов недоступна.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetricCard
                title="Открытые алерты"
                value={fmtNum(state.alertsSummary.open_total)}
                hint="Текущий аккаунт продавца"
              />
              <MetricCard
                title="Критический"
                value={fmtNum(state.alertsSummary.critical_count)}
                hint="Открытые критичные"
              />
              <MetricCard
                title="Высокий"
                value={fmtNum(state.alertsSummary.high_count)}
                hint="Открытые с высоким приоритетом"
              />
            </div>

            {state.alertsSummary.latest_run ? (
              <p className="text-xs text-gray-600">
                Последний запуск: статус={state.alertsSummary.latest_run.status}, начало=
                {fmtDateTime(state.alertsSummary.latest_run.started_at)}, завершение=
                {fmtDateTime(state.alertsSummary.latest_run.finished_at)}, всего=
                {state.alertsSummary.latest_run.total_alerts_count}
              </p>
            ) : (
              <p className="text-xs text-gray-600">Последний запуск: запусков ещё не было</p>
            )}

            {state.alertsSummary.open_total === 0 ? (
              <p className="rounded border border-green-300 bg-green-50 p-2 text-green-700">
                Нет открытых алертов.
              </p>
            ) : state.topAlerts.length === 0 ? (
              <p className="text-gray-600">Нет критичных/высоких алертов для показа.</p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Топ критичных и высоких алертов</p>
                <div className="space-y-2">
                  {state.topAlerts.map((a) => (
                    <Link
                      href="/app/alerts"
                      key={a.id}
                      className="block rounded border p-2 hover:bg-gray-50"
                    >
                      <p className="text-xs text-gray-600">
                        {a.severity} | {a.alert_group}
                      </p>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-gray-600">
                        {a.entity_sku != null
                          ? `SKU ${a.entity_sku}`
                          : a.entity_offer_id || a.entity_id || a.entity_type}
                        {" | "}последний раз={fmtDateTime(a.last_seen_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Критичные SKU</h2>
          <Link href="/app/critical-skus" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Открыть критичные SKU
          </Link>
        </div>
        {criticalSkusLoading ? (
          <p className="text-sm">Загрузка критичных SKU…</p>
        ) : criticalSkusError ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-3 text-sm text-amber-950">
              <p className="font-medium">Блок «Критичные SKU» недоступен</p>
              <p className="mt-1 text-amber-900/90">{criticalSkusError}</p>
              <Link href="/app/critical-skus" className={`mt-3 inline-flex ${buttonClassNames("secondary")}`}>
                Открыть критичные SKU
              </Link>
            </CardContent>
          </Card>
        ) : state.criticalSkuRows.length === 0 ? (
          <EmptyState
            title="Нет критичных SKU"
            message="За выбранный период критичные SKU не обнаружены."
            action={
              <Link href="/app/critical-skus" className={buttonClassNames("secondary")}>
                Открыть критичные SKU
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {state.criticalSkuRows.map((item) => (
              <Link
                key={`${item.ozon_product_id}-${item.offer_id ?? ""}-${item.sku ?? ""}`}
                href="/app/critical-skus"
                className="block rounded border p-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.product_name || "Товар без названия"}</p>
                    <p className="text-xs text-gray-600">{formatCriticalSkuEntity(item)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-gray-900">Индекс проблемы: {item.problem_score.toFixed(1)}</p>
                    <p className="text-gray-600">Важность: {item.importance.toFixed(1)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-700">
                  Выручка {fmtMoney(item.revenue)} · Заказы {fmtNum(item.sales_ops)} · Остаток {fmtNum(item.stock_available)} ·
                  Дни покрытия {item.days_of_cover == null ? "—" : item.days_of_cover.toFixed(2)}
                </p>
                <p className="mt-2 inline-flex rounded border bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
                  {buildCriticalSkuReason(item)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Риски по остаткам</h2>
          <Link href="/app/stocks-replenishment" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Остатки и пополнение
          </Link>
        </div>
        {stockRisksLoading ? (
          <p className="text-sm">Загрузка рисков по остаткам…</p>
        ) : stockRisksError ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-3 text-sm text-amber-950">
              <p className="font-medium">Риски по остаткам недоступны</p>
              <p className="mt-1 text-amber-900/90">{stockRisksError}</p>
              <Link href="/app/stocks-replenishment" className={`mt-3 inline-flex ${buttonClassNames("secondary")}`}>
                Остатки и пополнение
              </Link>
            </CardContent>
          </Card>
        ) : state.stockRiskRows.length === 0 ? (
          <EmptyState
            title="Нет рисков по остаткам"
            message="Срочных рисков пополнения в текущем представлении нет."
            action={
              <Link href="/app/stocks-replenishment" className={buttonClassNames("secondary")}>
                Открыть остатки и пополнение
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {state.stockRiskRows.map((item) => (
              <Link
                key={`${item.ozon_product_id}-${item.offer_id ?? ""}-${item.sku ?? ""}`}
                href="/app/stocks-replenishment"
                className="block rounded border p-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.product_name || "Товар без названия"}</p>
                    <p className="text-xs text-gray-600">{formatStockRiskEntity(item)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-gray-900">{priorityLabel(item.depletion_risk)}</p>
                    <p className="text-gray-600">Приоритет: {priorityLabel(item.replenishment_priority)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-700">
                  Текущий остаток {fmtNum(item.current_available_stock)} · Дни покрытия{" "}
                  {item.days_of_cover == null ? "—" : item.days_of_cover.toFixed(2)} · Оценка даты отсутствия остатка недоступна
                </p>
                <p className="mt-2 inline-flex rounded border bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
                  {formatStockRiskReason(item)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Риски рекламы</h2>
          <Link href="/app/advertising" className="text-xs text-blue-700 hover:underline">
            Открыть рекламу
          </Link>
        </div>
        {adRisksLoading ? (
          <p className="text-sm">Загрузка рисков рекламы…</p>
        ) : adRisksError ? (
          <p className="text-sm text-gray-600">См. уведомление о рекламе вверху страницы.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <MetricCard
                title="Расход всего"
                value={fmtMoney(state.adRiskSummary?.totalSpend ?? 0)}
                hint="Выбранный период"
              />
              <MetricCard
                title="Слабые кампании"
                value={fmtNum(state.adRiskSummary?.weakCampaigns ?? 0)}
                hint="Низкая эффективность"
              />
              <MetricCard
                title="Расход без результата"
                value={fmtNum(state.adRiskSummary?.spendWithoutResult ?? 0)}
                hint="Нет заказов или выручки"
              />
              <MetricCard
                title="Рекламируемые SKU с низким остатком"
                value={fmtNum(state.adRiskSummary?.lowStockAdvertisedSkus ?? 0)}
                hint="Проверьте остатки"
              />
            </div>

            {state.adRiskRows.length === 0 ? (
              <p className="rounded border border-green-300 bg-green-50 p-2 text-green-700">
                Риски рекламы не обнаружены.
              </p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Топ рисковых кампаний / SKU</p>
                <div className="space-y-2">
                  {state.adRiskRows.map((row, idx) => (
                    <article key={`${row.campaignLabel}-${row.title}-${idx}`} className="rounded border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{row.title}</p>
                          <p className="text-xs text-gray-600">{row.campaignLabel}</p>
                        </div>
                        <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5 text-xs">
                          {row.reason}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-700">
                        Расход {fmtMoney(row.spend)} · Выручка {fmtMoney(row.revenue)} · Заказы {fmtNum(row.orders)} ·
                        ROAS {row.roas == null ? "—" : row.roas.toFixed(2)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Риски цен и экономики</h2>
          <div className="flex gap-2">
            <Link href="/app/alerts" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
              Смотреть алерты
            </Link>
            <Link href="/app/pricing-constraints" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
              Ограничения по ценам
            </Link>
          </div>
        </div>
        {pricingRisksLoading ? (
          <p className="text-sm">Загрузка рисков по ценам…</p>
        ) : pricingRisksError ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-3 text-sm text-amber-950">
              <p className="font-medium">Риски цен и экономики недоступны</p>
              <p className="mt-1 text-amber-900/90">{pricingRisksError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                  Смотреть алерты
                </Link>
                <Link href="/app/pricing-constraints" className={buttonClassNames("secondary")}>
                  Ограничения по ценам
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : state.pricingRiskRows.length === 0 ? (
          <EmptyState
            title="Нет ценовых рисков"
            message="В этом представлении дашборда ценовые и экономические риски не найдены."
            action={
              <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                Смотреть алерты
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {state.pricingRiskRows.map((alert) => (
              <Link
                key={alert.id}
                href="/app/alerts"
                className="block rounded border p-3 hover:bg-gray-50"
              >
                <p className="text-xs text-gray-600">
                  <span className="inline-flex rounded border px-1.5 py-0.5">{alert.severity}</span>{" "}
                  <span className="inline-flex rounded border px-1.5 py-0.5">{priorityLabel(alert.urgency)}</span>{" "}
                  <span className="inline-flex rounded border px-1.5 py-0.5">{alert.alert_type}</span>
                </p>
                <p className="mt-1 font-medium">{alert.title}</p>
                <p className="line-clamp-2 text-xs text-gray-700">{alert.message}</p>
                <p className="mt-1 text-xs text-gray-600">
                  {formatAlertEntityLabel(alert)} | последний раз={fmtDateTime(alert.last_seen_at)}
                </p>
                {formatPricingEvidenceSummary(alert) ? (
                  <p className="mt-1 text-xs text-gray-600">{formatPricingEvidenceSummary(alert)}</p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Главные изменения</h2>
          <div className="flex items-center gap-2">
            <Link href="/app/alerts" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
              Смотреть алерты
            </Link>
            {topChangesError ? <span className="text-xs text-amber-700">Алерты «Главные изменения» недоступны.</span> : null}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
            Выручка день ко дню {fmtMoney(kpi.revenue_day_to_day_delta.abs)} ({fmtDeltaPct(kpi.revenue_day_to_day_delta.pct)})
          </span>
          <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
            Заказы день ко дню {fmtNum(kpi.orders_day_to_day_delta)}
          </span>
          <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
            Выручка неделя к неделе {fmtMoney(kpi.revenue_week_to_week_delta.abs)}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {Object.keys(salesAlertTypeCounts).length === 0 ? (
            <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5 text-gray-600">
              Нет открытых бейджей алертов по продажам.
            </span>
          ) : (
            Object.entries(salesAlertTypeCounts).map(([type, count]) => (
              <span key={type} className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
                {type}: {count}
              </span>
            ))
          )}
        </div>

        {topChangesLoading ? (
          <p className="text-sm">Загрузка главных изменений…</p>
        ) : topChangeRows.length === 0 ? (
          <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
            Значимых изменений не обнаружено.
          </p>
        ) : (
          <div className="space-y-2">
            {topChangeRows.map((row) => (
              <article key={row.key} className="rounded border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-gray-600">{row.entityLabel}</p>
                  </div>
                  {row.alert ? (
                    <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5 text-xs">
                      {row.alert.alert_type} · {row.alert.severity}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-gray-700">
                  Выручка {row.revenue == null ? "—" : fmtMoney(row.revenue)} · Заказы{" "}
                  {row.orders == null ? "—" : fmtNum(row.orders)} · Вклад{" "}
                  {row.contribution == null ? "—" : fmtMoney(row.contribution)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Таблица SKU (топ 20)</h2>
          <Link href="/app/critical-skus" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Открыть критичные SKU
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Товар</th>
                <th className="px-2 py-2">Выручка</th>
                <th className="px-2 py-2">Продажи (операции)</th>
                <th className="px-2 py-2">Доля</th>
                <th className="px-2 py-2">Вклад</th>
                <th className="px-2 py-2">Остаток</th>
                <th className="px-2 py-2">Дни покрытия</th>
              </tr>
            </thead>
            <tbody>
              {state.skuRows.map((row) => (
                <tr key={`${row.ozon_product_id}`} className="border-b align-top">
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.product_name || "—"}</div>
                    <div className="text-xs text-gray-500">
                      product_id={row.ozon_product_id} | offer={row.offer_id || "—"} | sku={row.sku ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-2">{fmtMoney(row.revenue)}</td>
                  <td className="px-2 py-2">{fmtNum(row.orders_count)}</td>
                  <td className="px-2 py-2">{row.share_of_revenue == null ? "—" : `${(row.share_of_revenue * 100).toFixed(1)}%`}</td>
                  <td className="px-2 py-2">{fmtMoney(row.contribution_to_revenue_change)}</td>
                  <td className="px-2 py-2">{fmtNum(row.stock_available)}</td>
                  <td className="px-2 py-2">{row.days_of_cover == null ? "—" : row.days_of_cover.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Таблица остатков (топ 20 строк по складам)</h2>
          <Link href="/app/stocks-replenishment" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Остатки и пополнение
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Товар</th>
                <th className="px-2 py-2">Склад</th>
                <th className="px-2 py-2">Всего</th>
                <th className="px-2 py-2">Зарезервировано</th>
                <th className="px-2 py-2">Доступно</th>
                <th className="px-2 py-2">Снимок</th>
              </tr>
            </thead>
            <tbody>
              {state.stocksRows.map((row) => (
                <tr key={`${row.ozon_product_id}-${row.warehouse}`} className="border-b align-top">
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.product_name || "—"}</div>
                    <div className="text-xs text-gray-500">
                      product_id={row.ozon_product_id} | offer={row.offer_id || "—"} | sku={row.sku ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-2">{row.warehouse}</td>
                  <td className="px-2 py-2">{fmtNum(row.quantity_total)}</td>
                  <td className="px-2 py-2">{fmtNum(row.quantity_reserved)}</td>
                  <td className="px-2 py-2">{fmtNum(row.quantity_available)}</td>
                  <td className="px-2 py-2">{fmtDateTime(row.snapshot_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

