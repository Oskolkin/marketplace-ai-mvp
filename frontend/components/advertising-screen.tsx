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
        setFetchError(reason instanceof Error ? reason.message : "Не удалось загрузить аналитику рекламы");
      }
    } catch (e) {
      setAnalytics(null);
      setFetchError(e instanceof Error ? e.message : "Не удалось загрузить аналитику рекламы");
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
        <LoadingState message="Загрузка аналитики рекламы…" />
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Реклама"
        subtitle="Расходы, эффективность и рискованные кампании по аналитике Ozon Advertising."
      />

      {showPerfWarning ? (
        <Card className="border-amber-200 bg-amber-50/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-950">Токен Performance API</CardTitle>
            <CardDescription className="text-amber-900/90">
              {perfTokenMissing ? (
                <p>
                  Токен Ozon Performance API не сохранён для этого аккаунта. Укажите его в разделе интеграции Ozon, чтобы загрузить показатели рекламы.
                </p>
              ) : null}
              {tokenLikeError ? (
                <p className={perfTokenMissing ? "mt-2" : ""}>
                  Эндпоинт рекламы вернул ошибку, которая часто означает отсутствующий или неверный токен Performance:{" "}
                  <span className="font-mono text-xs">{fetchError}</span>
                </p>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Link href="/app/integrations/ozon" className={buttonClassNames("primary")}>
              Интеграция Ozon
            </Link>
            <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
              Статус синхронизации
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {fetchError && !tokenLikeError ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="py-3 text-sm text-amber-950">
            <p className="font-medium">Данные по рекламе недоступны</p>
            <p className="mt-1 font-mono text-xs text-amber-900/90">{fetchError}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
                Статус синхронизации
              </Link>
              <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
                Интеграция Ozon
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {analytics && summary ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard title="Всего расходов" value={fmtMoney(summary.totalSpend)} hint="Отчётный период" />
            <MetricCard title="Слабые кампании" value={fmtNum(summary.weakCampaigns)} hint="ROAS ниже 1 или низкая эффективность" />
            <MetricCard
              title="Расход без результата"
              value={fmtNum(summary.spendWithoutResult)}
              hint="Траты без заказов/выручки"
            />
            <MetricCard
              title="Рекламные SKU с низким остатком"
              value={fmtNum(summary.lowStockAdvertisedSkus)}
              hint="Риск по покрытию остатка"
            />
            <MetricCard
              title="Кампании"
              value={summary.campaignsCount != null ? fmtNum(summary.campaignsCount) : "—"}
              hint={summary.campaignsCount != null ? "Из сводки" : "Количество не в ответе"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Рискованные кампании и SKU</CardTitle>
              <CardDescription>
                Отсортированы по серьёзности: траты без результата, слабый ROAS, затем по сумме расходов. Разбор ответа API выполнен устойчиво к сбоям.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="text-sm text-gray-600">
                  В текущем ответе нет рискованных строк. После синхронизации и алертов загляните в блок рисков рекламы на дашборде или запустите новую синхронизацию, если здесь должны быть кампании.
                </p>
              ) : (
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-gray-500">
                      <th className="py-2 pr-3 font-medium">Кампания</th>
                      <th className="py-2 pr-3 font-medium">SKU / offer ID / товар</th>
                      <th className="py-2 pr-3 font-medium text-right">Расход</th>
                      <th className="py-2 pr-3 font-medium text-right">Выручка</th>
                      <th className="py-2 pr-3 font-medium text-right">Заказы</th>
                      <th className="py-2 pr-3 font-medium text-right">ROAS</th>
                      <th className="py-2 font-medium">Риск / причина</th>
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
        <p className="text-sm text-gray-600">Ответ с данными рекламы не получен.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Быстрые ссылки</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/app/integrations/ozon" className={buttonClassNames("secondary")}>
            Интеграция Ozon
          </Link>
          <Link href="/app/sync-status" className={buttonClassNames("secondary")}>
            Статус синхронизации
          </Link>
          <Link href="/app/dashboard" className={buttonClassNames("secondary")}>
            Дашборд
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
