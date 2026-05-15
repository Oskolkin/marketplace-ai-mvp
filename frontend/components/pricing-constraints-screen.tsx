"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deactivateCategoryRule,
  deactivateSKUOverride,
  getEffectiveConstraints,
  getPricingConstraints,
  postCategoryRule,
  postPreview,
  postSKUOverride,
  putGlobalDefault,
  type EffectiveConstraint,
  type EffectiveListResponse,
  type PricingConstraintsResponse,
  type PricingRule,
  type PreviewResponse,
} from "@/lib/pricing-constraints-api";

type RuleForm = {
  min: string;
  max: string;
  margin: string;
  refPriceAdvanced: string;
  costAdvanced: string;
  isActive: boolean;
};

type CategoryForm = RuleForm & { categoryId: string; categoryCode: string };
type SkuForm = RuleForm & { sku: string; productId: string; offerId: string };
type PreviewForm = { refPrice: string; margin: string; min: string; max: string; input: string };

function emptyRule(): RuleForm {
  return { min: "", max: "", margin: "", refPriceAdvanced: "", costAdvanced: "", isActive: true };
}

function num(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

function int(v: string): number | undefined {
  const n = num(v);
  return n == null ? undefined : Math.trunc(n);
}

function mapRuleToForm(rule: PricingRule | null): RuleForm {
  if (!rule) return emptyRule();
  return {
    min: rule.min_price == null ? "" : String(rule.min_price),
    max: rule.max_price == null ? "" : String(rule.max_price),
    margin: rule.reference_margin_percent == null ? "" : String(rule.reference_margin_percent),
    refPriceAdvanced: rule.reference_price == null ? "" : String(rule.reference_price),
    costAdvanced: rule.implied_cost == null ? "" : String(rule.implied_cost),
    isActive: rule.is_active,
  };
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : Number(v).toFixed(4);
}

function isList(
  v: EffectiveListResponse | EffectiveConstraint
): v is EffectiveListResponse {
  return (v as EffectiveListResponse).items !== undefined;
}

export default function PricingConstraintsScreen() {
  const [data, setData] = useState<PricingConstraintsResponse | null>(null);
  const [effectiveList, setEffectiveList] = useState<EffectiveListResponse | null>(null);
  const [effectiveSingle, setEffectiveSingle] = useState<EffectiveConstraint | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [globalForm, setGlobalForm] = useState<RuleForm>(emptyRule());
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ ...emptyRule(), categoryId: "", categoryCode: "" });
  const [skuForm, setSkuForm] = useState<SkuForm>({ ...emptyRule(), sku: "", productId: "", offerId: "" });
  const [previewForm, setPreviewForm] = useState<PreviewForm>({ refPrice: "", margin: "", min: "", max: "", input: "" });
  const [filterSku, setFilterSku] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        const [rules, effective] = await Promise.all([
          getPricingConstraints(),
          getEffectiveConstraints({ limit, offset }),
        ]);
        setData(rules);
        setGlobalForm(mapRuleToForm(rules.global_default));
        if (isList(effective)) {
          setEffectiveList(effective);
          setEffectiveSingle(null);
        } else {
          setEffectiveSingle(effective);
          setEffectiveList(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить экран");
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
    // initial screen bootstrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadAll() {
    try {
      setLoading(true);
      setError("");
      const [rules, effective] = await Promise.all([
        getPricingConstraints(),
        getEffectiveConstraints({ limit, offset }),
      ]);
      setData(rules);
      setGlobalForm(mapRuleToForm(rules.global_default));
      if (isList(effective)) {
        setEffectiveList(effective);
        setEffectiveSingle(null);
      } else {
        setEffectiveSingle(effective);
        setEffectiveList(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить экран");
    } finally {
      setLoading(false);
    }
  }

  function rulePayload(form: RuleForm) {
    return {
      min_price: num(form.min),
      max_price: num(form.max),
      reference_margin_percent: num(form.margin),
      reference_price: num(form.refPriceAdvanced),
      implied_cost: num(form.costAdvanced),
      is_active: form.isActive,
    };
  }

  async function submitGlobal(e: FormEvent) {
    e.preventDefault();
    try {
      setWorking(true);
      setError("");
      await putGlobalDefault(rulePayload(globalForm));
      setSuccess("Глобальные значения по умолчанию сохранены.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить глобальные значения");
    } finally {
      setWorking(false);
    }
  }

  async function submitCategory(e: FormEvent) {
    e.preventDefault();
    try {
      setWorking(true);
      setError("");
      const categoryId = int(categoryForm.categoryId);
      if (!categoryId || categoryId <= 0) throw new Error("description_category_id должен быть > 0");
      await postCategoryRule({
        description_category_id: categoryId,
        category_code: categoryForm.categoryCode.trim() || undefined,
        ...rulePayload(categoryForm),
      });
      setSuccess("Правило категории сохранено.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить правило категории");
    } finally {
      setWorking(false);
    }
  }

  async function onDeactivateCategoryRule(ruleID: number) {
    try {
      setWorking(true);
      setError("");
      await deactivateCategoryRule(ruleID);
      setSuccess("Правило категории отключено.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить правило категории");
    } finally {
      setWorking(false);
    }
  }

  async function submitSkuOverride(e: FormEvent) {
    e.preventDefault();
    try {
      setWorking(true);
      setError("");
      const sku = int(skuForm.sku);
      const productId = int(skuForm.productId);
      const offerId = skuForm.offerId.trim() || undefined;
      if (!sku && !productId && !offerId) throw new Error("Укажите sku, product_id или offer_id");
      await postSKUOverride({
        sku: sku || undefined,
        product_id: productId || undefined,
        offer_id: offerId,
        ...rulePayload(skuForm),
      });
      setSuccess("Переопределение SKU сохранено.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить переопределение SKU");
    } finally {
      setWorking(false);
    }
  }

  async function onDeactivateSKUOverride(ruleID: number) {
    try {
      setWorking(true);
      setError("");
      await deactivateSKUOverride(ruleID);
      setSuccess("Переопределение SKU отключено.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить переопределение SKU");
    } finally {
      setWorking(false);
    }
  }

  async function submitPreview(e: FormEvent) {
    e.preventDefault();
    try {
      setWorking(true);
      setError("");
      const refPrice = num(previewForm.refPrice);
      const margin = num(previewForm.margin);
      if (refPrice == null || margin == null) throw new Error("Требуются reference_price и reference_margin_percent");
      const result = await postPreview({
        reference_price: refPrice,
        reference_margin_percent: margin,
        min_price: num(previewForm.min),
        max_price: num(previewForm.max),
        input_price: num(previewForm.input),
      });
      setPreview(result);
      setSuccess("Предпросчёт выполнен.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить предпросчёт");
    } finally {
      setWorking(false);
    }
  }

  async function loadEffective() {
    try {
      setWorking(true);
      setError("");
      const result = await getEffectiveConstraints({
        sku: int(filterSku),
        productId: int(filterProduct),
        limit,
        offset,
      });
      if (isList(result)) {
        setEffectiveList(result);
        setEffectiveSingle(null);
      } else {
        setEffectiveSingle(result);
        setEffectiveList(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить эффективные ограничения");
    } finally {
      setWorking(false);
    }
  }

  const effectiveRows = useMemo(
    () => (effectiveSingle ? [effectiveSingle] : effectiveList?.items ?? []),
    [effectiveList, effectiveSingle]
  );

  const productByID = useMemo(() => {
    const map = new Map<number, PricingConstraintsResponse["product_catalog"][number]>();
    for (const product of data?.product_catalog ?? []) {
      map.set(product.ozon_product_id, product);
    }
    return map;
  }, [data]);

  function resolveSkuOverrideView(row: PricingRule) {
    const targetID = row.scope_target_id ?? undefined;
    const byProduct = targetID ? productByID.get(targetID) : undefined;
    const bySKU =
      targetID == null
        ? undefined
        : (data?.product_catalog ?? []).find((p) => p.sku != null && p.sku === targetID);
    const byOffer =
      row.scope_target_code == null
        ? undefined
        : (data?.product_catalog ?? []).find((p) => p.offer_id === row.scope_target_code);
    const product = byProduct ?? bySKU ?? byOffer;
    const effective = (effectiveList?.items ?? []).find((item) => item.rule_id === row.id);
    return {
      productName: product?.product_name ?? "—",
      offerID: product?.offer_id ?? row.scope_target_code ?? "—",
      currentPrice: product?.current_price ?? row.reference_price,
      resolvedSource: effective?.resolved_from_scope_type ?? row.scope_type,
      effective,
    };
  }

  function prefillPreviewFromRow(referencePrice?: number | null, referenceMargin?: number | null) {
    setPreviewForm((s) => ({
      ...s,
      refPrice: referencePrice == null ? "" : String(referencePrice),
      margin: referenceMargin == null ? "" : String(referenceMargin),
    }));
    setSuccess("Форма предпросчёта заполнена из выбранной строки.");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  if (loading) return <main className="p-6">Загрузка ограничений ценообразования...</main>;

  if (!data) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error || "Не удалось загрузить ограничения ценообразования"}</p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Ограничения ценообразования</h1>
        <p className="text-sm text-gray-600">Правила, эффективные ограничения и объяснимый предпросчёт.</p>
      </div>

      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">{success}</p> : null}

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">Метаданные</h2>
        <p>Всего правил: {data.meta.total_rules}</p>
        <p>Активных правил: {data.meta.active_rules}</p>
        <p>Последнее изменение правил: {fmtDate(data.meta.last_rule_update_at)}</p>
        <p>Последний пересчёт: {fmtDate(data.meta.last_recompute_at)}</p>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Глобально по умолчанию</h2>
        <p className="mb-3 text-sm text-gray-600">
          Основные поля продавца: мин. цена, макс. цена, маржа при текущей цене.
        </p>
        <form onSubmit={submitGlobal} className="grid gap-2 md:grid-cols-3">
          <LabeledInput label="Мин. цена" value={globalForm.min} onChange={(v) => setGlobalForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="Макс. цена" value={globalForm.max} onChange={(v) => setGlobalForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="Маржа при текущей цене" value={globalForm.margin} onChange={(v) => setGlobalForm((s) => ({ ...s, margin: v }))} />
          <details className="md:col-span-3 rounded border p-2 text-sm">
            <summary className="cursor-pointer font-medium">Дополнительные поля</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <LabeledInput label="Текущая цена (необяз.)" value={globalForm.refPriceAdvanced} onChange={(v) => setGlobalForm((s) => ({ ...s, refPriceAdvanced: v }))} />
              <LabeledInput label="Расчётная себестоимость (необяз.)" value={globalForm.costAdvanced} onChange={(v) => setGlobalForm((s) => ({ ...s, costAdvanced: v }))} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={globalForm.isActive} onChange={(e) => setGlobalForm((s) => ({ ...s, isActive: e.target.checked }))} />
                Активно
              </label>
            </div>
          </details>
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Сохранение..." : "Сохранить глобально по умолчанию"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Правила по категориям</h2>
        {data.category_rules.length === 0 ? (
          <p className="text-sm text-gray-600">Правил для категорий пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">description_category_id</th>
                  <th className="px-2 py-2">Товаров в категории</th>
                  <th className="px-2 py-2">min</th>
                  <th className="px-2 py-2">max</th>
                  <th className="px-2 py-2">margin</th>
                  <th className="px-2 py-2">Действие</th>
                </tr>
              </thead>
              <tbody>
                {data.category_rules.map((row) => {
                  const count =
                    data.category_options.find((x) => x.description_category_id === row.scope_target_id)
                      ?.products_count ?? 0;
                  return (
                    <tr key={row.id} className="border-b">
                      <td className="px-2 py-2">{row.scope_target_id ?? "—"}</td>
                      <td className="px-2 py-2">{count}</td>
                      <td className="px-2 py-2">{fmtMoney(row.min_price)}</td>
                      <td className="px-2 py-2">{fmtMoney(row.max_price)}</td>
                      <td className="px-2 py-2">{fmtNum(row.reference_margin_percent)}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 hover:bg-gray-50"
                          onClick={() => onDeactivateCategoryRule(row.id)}
                          disabled={working}
                        >
                          Отключить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={submitCategory} className="grid gap-2 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-700">description_category_id</span>
            <select
              className="w-full rounded border px-2 py-1"
              value={categoryForm.categoryId}
              onChange={(e) => setCategoryForm((s) => ({ ...s, categoryId: e.target.value }))}
            >
              <option value="">Выберите из каталога…</option>
              {data.category_options.map((option) => (
                <option key={option.description_category_id} value={String(option.description_category_id)}>
                  {option.description_category_id} ({option.products_count} товаров)
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="category_code (необяз.)" value={categoryForm.categoryCode} onChange={(v) => setCategoryForm((s) => ({ ...s, categoryCode: v }))} />
          <LabeledInput label="Мин. цена" value={categoryForm.min} onChange={(v) => setCategoryForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="Макс. цена" value={categoryForm.max} onChange={(v) => setCategoryForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="Маржа при текущей цене" value={categoryForm.margin} onChange={(v) => setCategoryForm((s) => ({ ...s, margin: v }))} />
          <details className="md:col-span-3 rounded border p-2 text-sm">
            <summary className="cursor-pointer font-medium">Дополнительные поля</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <LabeledInput label="Текущая цена (необяз.)" value={categoryForm.refPriceAdvanced} onChange={(v) => setCategoryForm((s) => ({ ...s, refPriceAdvanced: v }))} />
              <LabeledInput label="Расчётная себестоимость (необяз.)" value={categoryForm.costAdvanced} onChange={(v) => setCategoryForm((s) => ({ ...s, costAdvanced: v }))} />
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={categoryForm.isActive} onChange={(e) => setCategoryForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Активно
          </label>
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Сохранение..." : "Сохранить правило категории"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Переопределения SKU</h2>
        {data.sku_overrides.length === 0 ? (
          <p className="text-sm text-gray-600">Переопределений SKU пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">offer_id</th>
                  <th className="px-2 py-2">Название товара</th>
                  <th className="px-2 py-2">Текущая цена</th>
                  <th className="px-2 py-2">Переопр. min / max / маржа</th>
                  <th className="px-2 py-2">Источник правила</th>
                  <th className="px-2 py-2">Действие</th>
                  <th className="px-2 py-2">Предпросчёт</th>
                </tr>
              </thead>
              <tbody>
                {data.sku_overrides.map((row) => {
                  const view = resolveSkuOverrideView(row);
                  return (
                    <tr key={row.id} className="border-b">
                      <td className="px-2 py-2">{view.offerID}</td>
                      <td className="px-2 py-2">{view.productName}</td>
                      <td className="px-2 py-2">{fmtMoney(view.currentPrice)}</td>
                      <td className="px-2 py-2">
                        min {fmtMoney(row.min_price)} / max {fmtMoney(row.max_price)} / маржа{" "}
                        {fmtNum(row.reference_margin_percent)}
                      </td>
                      <td className="px-2 py-2">{view.resolvedSource}</td>
                      <td className="px-2 py-2">
                        <button
                          className="rounded border px-2 py-1 hover:bg-gray-50"
                          onClick={() => onDeactivateSKUOverride(row.id)}
                          type="button"
                          disabled={working}
                        >
                          Отключить
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          className="rounded border px-2 py-1 hover:bg-gray-50"
                          onClick={() =>
                            prefillPreviewFromRow(view.currentPrice ?? row.reference_price, row.reference_margin_percent)
                          }
                          type="button"
                        >
                          Предпросчёт
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={submitSkuOverride} className="grid gap-2 md:grid-cols-3">
          <LabeledInput label="sku (необяз.)" value={skuForm.sku} onChange={(v) => setSkuForm((s) => ({ ...s, sku: v }))} />
          <LabeledInput label="product_id (необяз.)" value={skuForm.productId} onChange={(v) => setSkuForm((s) => ({ ...s, productId: v }))} />
          <LabeledInput label="offer_id (необяз.)" value={skuForm.offerId} onChange={(v) => setSkuForm((s) => ({ ...s, offerId: v }))} />
          <LabeledInput label="Мин. цена" value={skuForm.min} onChange={(v) => setSkuForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="Макс. цена" value={skuForm.max} onChange={(v) => setSkuForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="Маржа при текущей цене" value={skuForm.margin} onChange={(v) => setSkuForm((s) => ({ ...s, margin: v }))} />
          <details className="md:col-span-3 rounded border p-2 text-sm">
            <summary className="cursor-pointer font-medium">Дополнительные поля</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <LabeledInput label="Текущая цена (необяз.)" value={skuForm.refPriceAdvanced} onChange={(v) => setSkuForm((s) => ({ ...s, refPriceAdvanced: v }))} />
              <LabeledInput label="Расчётная себестоимость (необяз.)" value={skuForm.costAdvanced} onChange={(v) => setSkuForm((s) => ({ ...s, costAdvanced: v }))} />
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skuForm.isActive} onChange={(e) => setSkuForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Активно
          </label>
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Сохранение..." : "Сохранить переопределение SKU"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Эффективные ограничения</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <LabeledInput label="Фильтр SKU" value={filterSku} onChange={setFilterSku} />
          <LabeledInput label="Фильтр product_id" value={filterProduct} onChange={setFilterProduct} />
          <LabeledInput label="Лимит" value={String(limit)} onChange={(v) => setLimit(int(v) || 20)} />
          <LabeledInput label="Смещение" value={String(offset)} onChange={(v) => setOffset(int(v) || 0)} />
        </div>
        <button onClick={loadEffective} disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
          {working ? "Загрузка..." : "Загрузить эффективные ограничения"}
        </button>
        {effectiveRows.length === 0 ? (
          <p className="text-sm text-gray-600">Эффективные ограничения не найдены.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Товар / SKU</th>
                  <th className="px-2 py-2">Текущая цена</th>
                  <th className="px-2 py-2">Эффективные min / max</th>
                  <th className="px-2 py-2">Расчётная себестоимость</th>
                  <th className="px-2 py-2">Источник ограничения</th>
                  <th className="px-2 py-2">computed_at</th>
                  <th className="px-2 py-2">Предпросчёт</th>
                </tr>
              </thead>
              <tbody>
                {effectiveRows.map((row) => (
                  <tr key={`${row.ozon_product_id}-${row.rule_id}`} className="border-b">
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.product_name || "—"}</div>
                      <div className="text-xs text-gray-500">
                        product_id={row.ozon_product_id} | sku={row.sku ?? "—"} | offer=
                        {row.offer_id || "—"}
                      </div>
                    </td>
                    <td className="px-2 py-2">{fmtMoney(row.current_price ?? row.reference_price)}</td>
                    <td className="px-2 py-2">
                      min {fmtMoney(row.effective_min_price)} / max {fmtMoney(row.effective_max_price)}
                    </td>
                    <td className="px-2 py-2">{fmtNum(row.implied_cost)}</td>
                    <td className="px-2 py-2">{row.resolved_from_scope_type}</td>
                    <td className="px-2 py-2">{fmtDate(row.computed_at)}</td>
                    <td className="px-2 py-2">
                      <button
                        className="rounded border px-2 py-1 hover:bg-gray-50"
                        onClick={() =>
                          prefillPreviewFromRow(
                            row.current_price ?? row.reference_price,
                            row.reference_margin_percent
                          )
                        }
                        type="button"
                      >
                        Предпросчёт
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {effectiveList ? (
          <p className="text-xs text-gray-500">
            всего={effectiveList.total}, лимит={effectiveList.limit}, смещение={effectiveList.offset}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Предпросчёт</h2>
        <form onSubmit={submitPreview} className="grid gap-2 md:grid-cols-3">
          <LabeledInput label="reference_price" value={previewForm.refPrice} onChange={(v) => setPreviewForm((s) => ({ ...s, refPrice: v }))} />
          <LabeledInput label="reference_margin_percent" value={previewForm.margin} onChange={(v) => setPreviewForm((s) => ({ ...s, margin: v }))} />
          <LabeledInput label="min_price (необяз.)" value={previewForm.min} onChange={(v) => setPreviewForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="max_price (необяз.)" value={previewForm.max} onChange={(v) => setPreviewForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="input_price (необяз.)" value={previewForm.input} onChange={(v) => setPreviewForm((s) => ({ ...s, input: v }))} />
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Вычисление..." : "Выполнить предпросчёт"}
            </button>
          </div>
        </form>
        {preview ? (
          <div className="rounded border bg-gray-50 p-3 text-sm">
            <p>reference_price: {preview.reference_price}</p>
            <p>reference_margin_percent: {preview.reference_margin_percent}</p>
            <p>implied_cost: {preview.implied_cost}</p>
            <p>expected_margin_at_min_price: {fmtNum(preview.expected_margin_at_min_price)}</p>
            <p>expected_margin_at_max_price: {fmtNum(preview.expected_margin_at_max_price)}</p>
            <p>expected_margin_at_input_price: {fmtNum(preview.expected_margin_at_input_price)}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-600">Укажите поля предпросчёта и нажмите «Выполнить предпросчёт», чтобы увидеть рассчитанные объяснимые показатели.</p>
        )}
      </section>
    </main>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-gray-700">{label}</span>
      <input className="w-full rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

