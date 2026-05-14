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
  if (pct == null) return "n/a";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatEntityLabel(
  row: Pick<RecommendationItem, "entity_sku" | "entity_offer_id" | "entity_id" | "entity_type">,
): string {
  if (row.entity_sku != null) return `SKU: ${row.entity_sku}`;
  if (row.entity_offer_id) return `Offer: ${row.entity_offer_id}`;
  if (row.entity_id) return `ID: ${row.entity_id}`;
  return row.entity_type;
}

function formatRunLine(run: RecommendationsSummary["latest_run"]): string {
  if (!run) return "";
  const parts = [
    `status ${run.status}`,
    run.ai_model ? `model ${run.ai_model}` : null,
    run.ai_prompt_version ? `prompt ${run.ai_prompt_version}` : null,
    `generated ${run.generated_recommendations_count}`,
    `started ${fmtDateTime(run.started_at)}`,
    `finished ${fmtDateTime(run.finished_at)}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function priorityLabel(value: string): string {
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
  if (item.offer_id) return `Offer: ${item.offer_id}`;
  if (item.ozon_product_id != null) return `Product: ${item.ozon_product_id}`;
  return "Entity: not available";
}

function buildCriticalSkuReason(item: CriticalSKUItem): string {
  const firstSignal = item.signals?.[0];
  if (firstSignal) return firstSignal;
  if ((item.days_of_cover ?? Number.POSITIVE_INFINITY) <= 3 || item.stock_available <= 3) {
    return "Low stock / low days of cover";
  }
  if (item.problem_score >= 70) return "High problem score";
  if (item.revenue > 0 || item.sales_ops > 0) return "Material sales impact";
  return "Requires attention";
}

function formatStockRiskEntity(item: StocksReplenishmentItem): string {
  if (item.sku != null) return `SKU: ${item.sku}`;
  if (item.offer_id) return `Offer: ${item.offer_id}`;
  if (item.ozon_product_id != null) return `Product: ${item.ozon_product_id}`;
  return "Entity: not available";
}

function formatStockRiskReason(item: StocksReplenishmentItem): string {
  if (item.current_available_stock <= 0) return "Out of stock";
  if ((item.days_of_cover ?? Number.POSITIVE_INFINITY) <= 3) return "Critical coverage";
  if ((item.days_of_cover ?? Number.POSITIVE_INFINITY) <= 7) return "Low coverage";
  if (item.replenishment_priority === "critical" || item.replenishment_priority === "high") {
    return "High replenishment priority";
  }
  return "Stock risk";
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
  if (spend > 0 && revenue <= 0) return "Spend without result";
  if (spend > 0 && orders <= 0) return "No orders";
  if (roas != null && roas < 1) return "Weak ROAS";
  if (lowStockFlag) return "Low-stock advertised SKU";
  if (spend > 0) return "High spend";
  return "Advertising risk";
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
    getStr(row, ["campaign_name", "name", "title", "product_name", "sku_name"]) ?? "Advertising entity";
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
      ? `Campaign ${campaignId}`
      : sku
        ? `SKU: ${sku}`
        : offerId
          ? `Offer: ${offerId}`
          : "Campaign: not available";

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
  if (alert.entity_offer_id) return `Offer: ${alert.entity_offer_id}`;
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
    return `Current price ${fmtMoney(currentPrice)} · Min ${fmtMoney(minPrice)}`;
  }
  if (currentPrice != null && maxPrice != null) {
    return `Current price ${fmtMoney(currentPrice)} · Max ${fmtMoney(maxPrice)}`;
  }
  if (expectedMargin != null && thresholdMargin != null) {
    return `Expected margin ${(expectedMargin * 100).toFixed(1)}% · Threshold ${(thresholdMargin * 100).toFixed(1)}%`;
  }
  if (skuRevenue != null || ordersCount != null) {
    return `Revenue ${fmtMoney(skuRevenue ?? 0)} · Orders ${fmtNum(ordersCount ?? 0)}`;
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
  if (row.offer_id) return `Offer: ${row.offer_id}`;
  if (row.ozon_product_id != null) return `Product: ${row.ozon_product_id}`;
  return "Product";
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
      title: row.product_name || "Unnamed product",
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
      entityLabel: "Account",
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
            alertsErr instanceof Error ? `Alerts are unavailable. ${alertsErr.message}` : "Alerts are unavailable.",
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
              ? `Recommendations are unavailable. ${recErr.message}`
              : "Recommendations are unavailable.",
          );
        } finally {
          setRecSummaryLoading(false);
        }

        try {
          topRecommendations = await fetchOpenRecommendationsByPriority();
        } catch (recErr) {
          setRecListError(
            recErr instanceof Error
              ? `Recommendations are unavailable. ${recErr.message}`
              : "Recommendations are unavailable.",
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
              ? `Critical SKU is unavailable. ${criticalErr.message}`
              : "Critical SKU is unavailable.",
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
              ? `Stock risks are unavailable. ${stockErr.message}`
              : "Stock risks are unavailable.",
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
            adErr instanceof Error ? `Ad risks are unavailable. ${adErr.message}` : "Ad risks are unavailable.",
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
              ? `Price & economics risks are unavailable. ${pricingErr.message}`
              : "Price & economics risks are unavailable.",
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
              ? `Top changes alerts are unavailable. ${salesAlertsErr.message}`
              : "Top changes alerts are unavailable.",
          );
        } finally {
          setTopChangesLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setAlertsError("Alerts are unavailable.");
        setRecSummaryError(
          "Recommendations are unavailable."
        );
        setRecListError(
          "Recommendations are unavailable."
        );
        setCriticalSkusError(
          "Critical SKU is unavailable."
        );
        setStockRisksError(
          "Stock risks are unavailable."
        );
        setAdRisksError(
          "Ad risks are unavailable."
        );
        setPricingRisksError(
          "Price & economics risks are unavailable."
        );
        setTopChangesError(
          "Top changes alerts are unavailable."
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
        <LoadingState message="Loading dashboard…" />
      </main>
    );
  }

  if (!state.summary) {
    return (
      <main className="space-y-4 p-6">
        {error ? (
          <ErrorState
            title="Dashboard unavailable"
            message={error}
            action={
              <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
                Open Sync Status
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No dashboard summary"
            message="Metrics are not ready yet. Complete a successful Ozon sync, wait for recalculation, then refresh this page."
            action={
              <Link href="/app/sync-status" className={buttonClassNames("primary")}>
                Open Sync Status
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
          title="Dashboard"
          subtitle="Daily work center for metrics, risks, and AI recommendations."
        />

        <Card className="border-gray-200 bg-gray-50/60">
          <CardContent className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Data as of</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {summary.as_of_date
                  ? `${summary.as_of_date}${summary.as_of_date_source ? ` (${summary.as_of_date_source})` : ""}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Last successful sync
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {summary.last_successful_update ? fmtDateTime(summary.last_successful_update) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Alerts latest run
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {alertsLoading
                  ? "Loading…"
                  : alertsError || !state.alertsSummary
                    ? "Unavailable"
                    : state.alertsSummary.latest_run
                      ? `${state.alertsSummary.latest_run.status} · ${fmtDateTime(state.alertsSummary.latest_run.finished_at ?? state.alertsSummary.latest_run.started_at)}`
                      : "No run yet"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Recommendations latest run
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {recSummaryLoading
                  ? "Loading…"
                  : recSummaryError || !state.recSummary
                    ? "Unavailable"
                    : state.recSummary.latest_run
                      ? `${state.recSummary.latest_run.status} · ${fmtDateTime(state.recSummary.latest_run.finished_at ?? state.recSummary.latest_run.started_at)}`
                      : "No run yet"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Data freshness</p>
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
            <CardTitle className="text-base text-amber-950">Alerts need attention</CardTitle>
            <CardDescription className="text-amber-900/90">
              {alertsError
                ? "The alerts summary could not be loaded from the API."
                : "The latest alerts run reported a failure — open Alerts for details and re-run if needed."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app/alerts" className={buttonClassNames("secondary")}>
              Open Alerts
            </Link>
          </CardContent>
        </Card>
      )}

      {(recSummaryError || recRunFailed || recListError) && (
        <Card className="border-amber-300 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Recommendations need attention</CardTitle>
            <CardDescription className="text-amber-900/90">
              {recSummaryError
                ? "The recommendations summary could not be loaded."
                : recListError
                  ? "The recommendations list could not be loaded."
                  : "The latest recommendation run reported a failure — open Recommendations to inspect."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app/recommendations" className={buttonClassNames("secondary")}>
              Open Recommendations
            </Link>
          </CardContent>
        </Card>
      )}

      {adRisksError ? (
        <Card className="border-amber-300 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Advertising analytics unavailable</CardTitle>
            <CardDescription className="text-amber-900/90">
              {isLikelyAdsPerformanceTokenIssue(adRisksError)
                ? "Ad metrics often require a Performance API token. Add or check the token on Ozon Integration — Seller sync and core dashboard KPIs still work."
                : `${adRisksError}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
              Ozon Integration
            </Link>
            <Link href="/app/sync-status" className={buttonClassNames("ghost", "border border-amber-200")}>
              Sync status
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Revenue"
          value={fmtMoney(kpi.revenue_current)}
          hint={`Day-to-day: ${fmtMoney(kpi.revenue_day_to_day_delta.abs)} (${fmtDeltaPct(kpi.revenue_day_to_day_delta.pct)}) · Week-to-week: ${fmtMoney(kpi.revenue_week_to_week_delta.abs)} (${fmtDeltaPct(kpi.revenue_week_to_week_delta.pct)})`}
        />
        <MetricCard
          title="Orders"
          value={fmtNum(kpi.orders_current)}
          hint={`Day-to-day delta: ${fmtNum(kpi.orders_day_to_day_delta)} orders (same KPI window as revenue)`}
        />
        <MetricCard
          title="Returns"
          value={fmtNum(kpi.returns_current)}
          hint="Current reporting day — compare with data as-of above"
        />
        <MetricCard
          title="Cancels"
          value={fmtNum(kpi.cancels_current)}
          hint="Current reporting day — compare with data as-of above"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s action list</CardTitle>
          <CardDescription>
            Highest-priority items to validate in the MVP — recommendations first, then alerts, then
            inventory signals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {recListLoading || alertsLoading || criticalSkusLoading || stockRisksLoading ? (
            <p className="text-gray-600">Loading actions…</p>
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
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Critical SKU</p>
                  <div className="space-y-2">
                    {actionPanel.critical.map((item) => (
                      <Link
                        key={`${item.ozon_product_id}-${item.sku ?? ""}`}
                        href="/app/critical-skus"
                        className="block rounded-lg border border-gray-200 bg-white p-2 text-xs hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">
                          {item.product_name || "Product"}
                        </span>
                        <span className="mt-1 block text-gray-600">{buildCriticalSkuReason(item)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
              {actionPanel.stock.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Stock risks</p>
                  <div className="space-y-2">
                    {actionPanel.stock.map((item) => (
                      <Link
                        key={`${item.ozon_product_id}-${item.sku ?? ""}`}
                        href="/app/stocks-replenishment"
                        className="block rounded-lg border border-gray-200 bg-white p-2 text-xs hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">
                          {item.product_name || "Product"}
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
              title="No prioritized actions yet"
              message="Run alerts and generate recommendations after sync, or open downstream screens when data appears."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                    Run Alerts
                  </Link>
                  <Link href="/app/recommendations" className={buttonClassNames("primary")}>
                    Generate recommendations
                  </Link>
                </div>
              }
            />
          )}
          <p className="border-t border-gray-100 pt-3 text-center text-xs text-gray-600">
            <Link href="/app/recommendations" className="font-medium text-blue-700 underline hover:text-blue-900">
              All recommendations
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">Recommendations summary</CardTitle>
              <CardDescription className="mt-0.5">
                Counts and latest run — expand for details. Actions stay in Today&apos;s list above.
              </CardDescription>
            </div>
            <span className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
              <span className="hidden text-gray-500 sm:inline">Expand</span>
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
                View recommendations
              </Link>
            </span>
          </summary>
          <CardContent className="space-y-3 border-t border-gray-100 pt-3 text-sm">
            {recSummaryLoading ? (
              <p className="text-sm text-gray-600">Loading recommendations summary…</p>
            ) : recSummaryError || recListError || recRunFailed ? (
              <p className="text-sm text-gray-600">See the recommendations notice above.</p>
            ) : !state.recSummary ? (
              <p className="text-sm text-gray-600">Recommendations summary is unavailable.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <MetricCard
                    title="Open recommendations"
                    value={fmtNum(state.recSummary.open_total)}
                    hint="Open items"
                  />
                  <MetricCard
                    title="Critical"
                    value={fmtNum(state.recSummary.by_priority.critical)}
                    hint="By priority"
                  />
                  <MetricCard
                    title="High"
                    value={fmtNum(state.recSummary.by_priority.high)}
                    hint="By priority"
                  />
                  <MetricCard
                    title="Medium"
                    value={fmtNum(state.recSummary.by_priority.medium)}
                    hint="By priority"
                  />
                  <MetricCard
                    title="Latest run status"
                    value={state.recSummary.latest_run?.status ?? "No run"}
                    hint={state.recSummary.latest_run ? "Recommendation run" : "No recommendation run yet"}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  {state.recSummary.latest_run
                    ? formatRunLine(state.recSummary.latest_run)
                    : "No recommendation run yet"}
                </p>
              </>
            )}

            {recListLoading ? (
              <p className="text-sm text-gray-600">Loading recommendation counts…</p>
            ) : recListError || recSummaryError || recRunFailed ? null : state.recSummary?.open_total === 0 ? (
              <EmptyState
                title="No open recommendations"
                message="Generate AI recommendations after alerts and metrics are available."
                action={
                  <Link href="/app/recommendations" className={buttonClassNames("primary")}>
                    Generate recommendations
                  </Link>
                }
              />
            ) : (
              <p className="text-xs text-gray-600">
                Top open items appear in <strong>Today&apos;s action list</strong>.{" "}
                <Link href="/app/recommendations" className="font-medium text-blue-700 underline hover:text-blue-900">
                  Open Recommendations
                </Link>{" "}
                to filter, accept, or dismiss.
              </p>
            )}
          </CardContent>
        </details>
      </Card>

      <section className="rounded border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Ask AI about your store</h2>
            <p className="text-sm text-gray-600">
              Ask questions about sales, stock, ads, alerts, and recommendations.
            </p>
          </div>
          <Link href="/app/chat" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Open AI Chat
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
            <h2 className="text-lg font-semibold">Critical alerts</h2>
            <p className="text-xs text-gray-600">Open alerts that need attention.</p>
          </div>
          <Link href="/app/alerts" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            View alerts
          </Link>
        </div>
        {alertsLoading ? (
          <p className="text-sm">Loading alerts teaser...</p>
        ) : alertsError || alertsRunFailed ? (
          <p className="text-sm text-gray-600">See the alerts notice at the top of the page.</p>
        ) : !state.alertsSummary ? (
          <p className="text-sm text-gray-600">Alerts summary is unavailable.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetricCard
                title="Open alerts"
                value={fmtNum(state.alertsSummary.open_total)}
                hint="Current seller account"
              />
              <MetricCard
                title="Critical"
                value={fmtNum(state.alertsSummary.critical_count)}
                hint="Open critical alerts"
              />
              <MetricCard
                title="High"
                value={fmtNum(state.alertsSummary.high_count)}
                hint="Open high alerts"
              />
            </div>

            {state.alertsSummary.latest_run ? (
              <p className="text-xs text-gray-600">
                latest_run: status={state.alertsSummary.latest_run.status}, started=
                {fmtDateTime(state.alertsSummary.latest_run.started_at)}, finished=
                {fmtDateTime(state.alertsSummary.latest_run.finished_at)}, total=
                {state.alertsSummary.latest_run.total_alerts_count}
              </p>
            ) : (
              <p className="text-xs text-gray-600">latest_run: no runs yet</p>
            )}

            {state.alertsSummary.open_total === 0 ? (
              <p className="rounded border border-green-300 bg-green-50 p-2 text-green-700">
                No open alerts.
              </p>
            ) : state.topAlerts.length === 0 ? (
              <p className="text-gray-600">No critical/high alerts to highlight.</p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Top critical/high alerts</p>
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
                        {" | "}last_seen={fmtDateTime(a.last_seen_at)}
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
          <h2 className="text-lg font-semibold">Critical SKU</h2>
          <Link href="/app/critical-skus" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Open Critical SKU
          </Link>
        </div>
        {criticalSkusLoading ? (
          <p className="text-sm">Loading critical SKU...</p>
        ) : criticalSkusError ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-3 text-sm text-amber-950">
              <p className="font-medium">Critical SKU block unavailable</p>
              <p className="mt-1 text-amber-900/90">{criticalSkusError}</p>
              <Link href="/app/critical-skus" className={`mt-3 inline-flex ${buttonClassNames("secondary")}`}>
                Open Critical SKU
              </Link>
            </CardContent>
          </Card>
        ) : state.criticalSkuRows.length === 0 ? (
          <EmptyState
            title="No critical SKU"
            message="No critical SKU detected for the selected period."
            action={
              <Link href="/app/critical-skus" className={buttonClassNames("secondary")}>
                Open Critical SKU
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
                    <p className="font-medium">{item.product_name || "Unnamed product"}</p>
                    <p className="text-xs text-gray-600">{formatCriticalSkuEntity(item)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-gray-900">Problem score: {item.problem_score.toFixed(1)}</p>
                    <p className="text-gray-600">Importance: {item.importance.toFixed(1)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-700">
                  Revenue {fmtMoney(item.revenue)} · Orders {fmtNum(item.sales_ops)} · Stock {fmtNum(item.stock_available)} ·
                  Days of cover {item.days_of_cover == null ? "—" : item.days_of_cover.toFixed(2)}
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
          <h2 className="text-lg font-semibold">Stock risks</h2>
          <Link href="/app/stocks-replenishment" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Stocks & replenishment
          </Link>
        </div>
        {stockRisksLoading ? (
          <p className="text-sm">Loading stock risks...</p>
        ) : stockRisksError ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-3 text-sm text-amber-950">
              <p className="font-medium">Stock risks unavailable</p>
              <p className="mt-1 text-amber-900/90">{stockRisksError}</p>
              <Link href="/app/stocks-replenishment" className={`mt-3 inline-flex ${buttonClassNames("secondary")}`}>
                Stocks & replenishment
              </Link>
            </CardContent>
          </Card>
        ) : state.stockRiskRows.length === 0 ? (
          <EmptyState
            title="No stock risks"
            message="No urgent replenishment risks for the current view."
            action={
              <Link href="/app/stocks-replenishment" className={buttonClassNames("secondary")}>
                Open Stocks & replenishment
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
                    <p className="font-medium">{item.product_name || "Unnamed product"}</p>
                    <p className="text-xs text-gray-600">{formatStockRiskEntity(item)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-gray-900">{priorityLabel(item.depletion_risk)}</p>
                    <p className="text-gray-600">Priority: {priorityLabel(item.replenishment_priority)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-700">
                  Current stock {fmtNum(item.current_available_stock)} · Days of cover{" "}
                  {item.days_of_cover == null ? "—" : item.days_of_cover.toFixed(2)} · Estimated stockout date not available
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
          <h2 className="text-lg font-semibold">Ad risks</h2>
          <Link href="/app/advertising" className="text-xs text-blue-700 hover:underline">
            Open Advertising
          </Link>
        </div>
        {adRisksLoading ? (
          <p className="text-sm">Loading ad risks...</p>
        ) : adRisksError ? (
          <p className="text-sm text-gray-600">See the advertising notice at the top of the page.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <MetricCard
                title="Total spend"
                value={fmtMoney(state.adRiskSummary?.totalSpend ?? 0)}
                hint="Selected period"
              />
              <MetricCard
                title="Weak campaigns"
                value={fmtNum(state.adRiskSummary?.weakCampaigns ?? 0)}
                hint="Low efficiency"
              />
              <MetricCard
                title="Spend without result"
                value={fmtNum(state.adRiskSummary?.spendWithoutResult ?? 0)}
                hint="No orders or revenue"
              />
              <MetricCard
                title="Low-stock advertised SKUs"
                value={fmtNum(state.adRiskSummary?.lowStockAdvertisedSkus ?? 0)}
                hint="Needs stock check"
              />
            </div>

            {state.adRiskRows.length === 0 ? (
              <p className="rounded border border-green-300 bg-green-50 p-2 text-green-700">
                No ad risks detected.
              </p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Top risky campaigns / SKUs</p>
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
                        Spend {fmtMoney(row.spend)} · Revenue {fmtMoney(row.revenue)} · Orders {fmtNum(row.orders)} ·
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
          <h2 className="text-lg font-semibold">Price & economics risks</h2>
          <div className="flex gap-2">
            <Link href="/app/alerts" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
              View alerts
            </Link>
            <Link href="/app/pricing-constraints" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
              Pricing constraints
            </Link>
          </div>
        </div>
        {pricingRisksLoading ? (
          <p className="text-sm">Loading price/economics risks...</p>
        ) : pricingRisksError ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-3 text-sm text-amber-950">
              <p className="font-medium">Price & economics risks unavailable</p>
              <p className="mt-1 text-amber-900/90">{pricingRisksError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                  View alerts
                </Link>
                <Link href="/app/pricing-constraints" className={buttonClassNames("secondary")}>
                  Pricing constraints
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : state.pricingRiskRows.length === 0 ? (
          <EmptyState
            title="No price risks"
            message="No price or economics risks matched this dashboard view."
            action={
              <Link href="/app/alerts" className={buttonClassNames("secondary")}>
                View alerts
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
                  {formatAlertEntityLabel(alert)} | last_seen={fmtDateTime(alert.last_seen_at)}
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
          <h2 className="text-lg font-semibold">Top changes</h2>
          <div className="flex items-center gap-2">
            <Link href="/app/alerts" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
              View alerts
            </Link>
            {topChangesError ? <span className="text-xs text-amber-700">Top changes alerts are unavailable.</span> : null}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
            Revenue DoD {fmtMoney(kpi.revenue_day_to_day_delta.abs)} ({fmtDeltaPct(kpi.revenue_day_to_day_delta.pct)})
          </span>
          <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
            Orders DoD {fmtNum(kpi.orders_day_to_day_delta)}
          </span>
          <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5">
            Revenue WoW {fmtMoney(kpi.revenue_week_to_week_delta.abs)}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {Object.keys(salesAlertTypeCounts).length === 0 ? (
            <span className="inline-flex rounded border bg-gray-50 px-2 py-0.5 text-gray-600">
              No open sales alert badges.
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
          <p className="text-sm">Loading top changes...</p>
        ) : topChangeRows.length === 0 ? (
          <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
            No significant changes detected.
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
                  Revenue {row.revenue == null ? "—" : fmtMoney(row.revenue)} · Orders{" "}
                  {row.orders == null ? "—" : fmtNum(row.orders)} · Contribution{" "}
                  {row.contribution == null ? "—" : fmtMoney(row.contribution)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">SKU table (top 20)</h2>
          <Link href="/app/critical-skus" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Open Critical SKU
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Revenue</th>
                <th className="px-2 py-2">Sales ops</th>
                <th className="px-2 py-2">Share</th>
                <th className="px-2 py-2">Contribution</th>
                <th className="px-2 py-2">Stock</th>
                <th className="px-2 py-2">Days of cover</th>
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
          <h2 className="text-lg font-semibold">Stocks table (top 20 warehouse rows)</h2>
          <Link href="/app/stocks-replenishment" className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Stocks & replenishment
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Warehouse</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Reserved</th>
                <th className="px-2 py-2">Available</th>
                <th className="px-2 py-2">Snapshot</th>
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

