"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buttonClassNames } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { getAdvertisingAnalytics, type AdvertisingAnalyticsResponse } from "@/lib/analytics-api";
import {
  collectAdRiskRows,
  isLikelyAdsPerformanceTokenIssue,
  summarizeAdRisksFromResponse,
} from "@/lib/advertising-analytics-helpers";
import { getOzonConnection, getOzonIngestionStatus } from "@/lib/ozon-api";

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

function fmtRoas(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(2);
}

export default function AdvertisingScreen() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AdvertisingAnalyticsResponse | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [perfTokenMissing, setPerfTokenMissing] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const [connRes, ingRes, adsRes] = await Promise.allSettled([
        getOzonConnection(),
        getOzonIngestionStatus(),
        getAdvertisingAnalytics(),
      ]);

      const conn = connRes.status === "fulfilled" ? connRes.value.connection : null;
      const ing = ingRes.status === "fulfilled" ? ingRes.value : null;
      const tokenSet = conn?.performance_token_set ?? ing?.performance_token_set ?? false;
      setPerfTokenMissing(!tokenSet);

      if (adsRes.status === "fulfilled") {
        setAnalytics(adsRes.value);
      } else {
        setAnalytics(null);
        const reason = adsRes.reason;
        setFetchError(reason instanceof Error ? reason.message : "Advertising analytics failed");
      }
    } catch (e) {
      setAnalytics(null);
      setFetchError(e instanceof Error ? e.message : "Advertising analytics failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (analytics ? collectAdRiskRows(analytics, 200) : []), [analytics]);
  const summary = useMemo(
    () => (analytics ? summarizeAdRisksFromResponse(analytics, rows) : null),
    [analytics, rows],
  );

  const tokenLikeError = fetchError && isLikelyAdsPerformanceTokenIssue(fetchError);
  const showPerfWarning = perfTokenMissing === true || Boolean(tokenLikeError);

  if (loading) {
    return (
      <main className="p-6">
        <LoadingState message="Loading advertising analytics…" />
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Advertising"
        subtitle="Spend, efficiency, and risky campaigns from Ozon advertising analytics."
      />

      {showPerfWarning ? (
        <Card className="border-amber-200 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Performance API token</CardTitle>
            <CardDescription className="text-amber-900/90">
              {perfTokenMissing ? (
                <p>
                  Ozon Performance API token is not saved for this account. Add it under Ozon Integration to load
                  advertising metrics.
                </p>
              ) : null}
              {tokenLikeError ? (
                <p className={perfTokenMissing ? "mt-2" : ""}>
                  The advertising endpoint returned an error that often means a missing or invalid Performance token:{" "}
                  <span className="font-mono text-xs">{fetchError}</span>
                </p>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Link href="/app/integrations/ozon" className={buttonClassNames("primary")}>
              Ozon Integration
            </Link>
            <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
              Sync Status
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {fetchError && !tokenLikeError ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="py-3 text-sm text-amber-950">
            <p className="font-medium">Advertising data unavailable</p>
            <p className="mt-1 font-mono text-xs text-amber-900/90">{fetchError}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
                Sync Status
              </Link>
              <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
                Ozon Integration
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {analytics && summary ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard title="Total spend" value={fmtMoney(summary.totalSpend)} hint="Reporting window" />
            <MetricCard title="Weak campaigns" value={fmtNum(summary.weakCampaigns)} hint="ROAS below 1 or low efficiency" />
            <MetricCard
              title="Spend without result"
              value={fmtNum(summary.spendWithoutResult)}
              hint="Spend with no orders/revenue"
            />
            <MetricCard
              title="Low-stock advertised SKUs"
              value={fmtNum(summary.lowStockAdvertisedSkus)}
              hint="Stock coverage risk"
            />
            <MetricCard
              title="Campaigns"
              value={summary.campaignsCount != null ? fmtNum(summary.campaignsCount) : "—"}
              hint={summary.campaignsCount != null ? "From summary" : "Count not in response"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Risky campaigns and SKUs</CardTitle>
              <CardDescription>
                Sorted by severity: spend without results, weak ROAS, then by spend. Parsed defensively from API
                payload.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No risky rows in the current response. After sync and alerts, check the Dashboard ad risks teaser or
                  run a new sync if you expect campaigns here.
                </p>
              ) : (
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-gray-500">
                      <th className="py-2 pr-3 font-medium">Campaign</th>
                      <th className="py-2 pr-3 font-medium">SKU / offer / product</th>
                      <th className="py-2 pr-3 font-medium text-right">Spend</th>
                      <th className="py-2 pr-3 font-medium text-right">Revenue</th>
                      <th className="py-2 pr-3 font-medium text-right">Orders</th>
                      <th className="py-2 pr-3 font-medium text-right">ROAS</th>
                      <th className="py-2 font-medium">Risk / reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={`${row.campaignLabel}-${row.entityLabel}-${idx}`} className="border-b border-gray-100">
                        <td className="max-w-[220px] py-2 pr-3 align-top">
                          <p className="font-medium text-gray-900">{row.title}</p>
                          <p className="text-xs text-gray-600">{row.campaignLabel}</p>
                        </td>
                        <td className="max-w-[180px] py-2 pr-3 align-top text-xs text-gray-700">{row.entityLabel}</td>
                        <td className="py-2 pr-3 align-top text-right tabular-nums">{fmtMoney(row.spend)}</td>
                        <td className="py-2 pr-3 align-top text-right tabular-nums">{fmtMoney(row.revenue)}</td>
                        <td className="py-2 pr-3 align-top text-right tabular-nums">{fmtNum(row.orders)}</td>
                        <td className="py-2 pr-3 align-top text-right tabular-nums">{fmtRoas(row.roas)}</td>
                        <td className="py-2 align-top text-xs text-gray-800">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      ) : !fetchError ? (
        <p className="text-sm text-gray-600">No advertising payload returned.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
            Ozon Integration
          </Link>
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Sync Status
          </Link>
          <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
            Dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
