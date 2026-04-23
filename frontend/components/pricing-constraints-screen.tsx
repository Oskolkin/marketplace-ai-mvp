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
        setError(e instanceof Error ? e.message : "Failed to load screen");
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
      setError(e instanceof Error ? e.message : "Failed to load screen");
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
      setSuccess("Global default saved.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save global default");
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
      if (!categoryId || categoryId <= 0) throw new Error("description_category_id must be > 0");
      await postCategoryRule({
        description_category_id: categoryId,
        category_code: categoryForm.categoryCode.trim() || undefined,
        ...rulePayload(categoryForm),
      });
      setSuccess("Category rule saved.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category rule");
    } finally {
      setWorking(false);
    }
  }

  async function onDeactivateCategoryRule(ruleID: number) {
    try {
      setWorking(true);
      setError("");
      await deactivateCategoryRule(ruleID);
      setSuccess("Category rule deactivated.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate category rule");
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
      if (!sku && !productId && !offerId) throw new Error("Provide sku or product_id or offer_id");
      await postSKUOverride({
        sku: sku || undefined,
        product_id: productId || undefined,
        offer_id: offerId,
        ...rulePayload(skuForm),
      });
      setSuccess("SKU override saved.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SKU override");
    } finally {
      setWorking(false);
    }
  }

  async function onDeactivateSKUOverride(ruleID: number) {
    try {
      setWorking(true);
      setError("");
      await deactivateSKUOverride(ruleID);
      setSuccess("SKU override deactivated.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate SKU override");
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
      if (refPrice == null || margin == null) throw new Error("reference_price and reference_margin_percent are required");
      const result = await postPreview({
        reference_price: refPrice,
        reference_margin_percent: margin,
        min_price: num(previewForm.min),
        max_price: num(previewForm.max),
        input_price: num(previewForm.input),
      });
      setPreview(result);
      setSuccess("Preview calculated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed preview");
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
      setError(err instanceof Error ? err.message : "Failed to load effective constraints");
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
    setSuccess("Preview form prefilled from selected row.");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  if (loading) return <main className="p-6">Loading pricing constraints...</main>;

  if (!data) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error || "Failed to load pricing constraints"}</p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing Constraints</h1>
        <p className="text-sm text-gray-600">Rules, effective constraints and explainable preview.</p>
      </div>

      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">{success}</p> : null}

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">Meta</h2>
        <p>Total rules: {data.meta.total_rules}</p>
        <p>Active rules: {data.meta.active_rules}</p>
        <p>Last rule update: {fmtDate(data.meta.last_rule_update_at)}</p>
        <p>Last recompute: {fmtDate(data.meta.last_recompute_at)}</p>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Global Defaults</h2>
        <p className="mb-3 text-sm text-gray-600">
          Main seller inputs: min price, max price, margin at current price.
        </p>
        <form onSubmit={submitGlobal} className="grid gap-2 md:grid-cols-3">
          <LabeledInput label="Min price" value={globalForm.min} onChange={(v) => setGlobalForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="Max price" value={globalForm.max} onChange={(v) => setGlobalForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="Margin at current price" value={globalForm.margin} onChange={(v) => setGlobalForm((s) => ({ ...s, margin: v }))} />
          <details className="md:col-span-3 rounded border p-2 text-sm">
            <summary className="cursor-pointer font-medium">Advanced fields</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <LabeledInput label="Current price (optional)" value={globalForm.refPriceAdvanced} onChange={(v) => setGlobalForm((s) => ({ ...s, refPriceAdvanced: v }))} />
              <LabeledInput label="Implied cost (optional)" value={globalForm.costAdvanced} onChange={(v) => setGlobalForm((s) => ({ ...s, costAdvanced: v }))} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={globalForm.isActive} onChange={(e) => setGlobalForm((s) => ({ ...s, isActive: e.target.checked }))} />
                Active
              </label>
            </div>
          </details>
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Saving..." : "Save global default"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Category Rules</h2>
        {data.category_rules.length === 0 ? (
          <p className="text-sm text-gray-600">No category rules yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">description_category_id</th>
                  <th className="px-2 py-2">products in category</th>
                  <th className="px-2 py-2">min</th>
                  <th className="px-2 py-2">max</th>
                  <th className="px-2 py-2">margin</th>
                  <th className="px-2 py-2">action</th>
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
                          Deactivate
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
              <option value="">Select from products…</option>
              {data.category_options.map((option) => (
                <option key={option.description_category_id} value={String(option.description_category_id)}>
                  {option.description_category_id} ({option.products_count} products)
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="category_code (optional)" value={categoryForm.categoryCode} onChange={(v) => setCategoryForm((s) => ({ ...s, categoryCode: v }))} />
          <LabeledInput label="Min price" value={categoryForm.min} onChange={(v) => setCategoryForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="Max price" value={categoryForm.max} onChange={(v) => setCategoryForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="Margin at current price" value={categoryForm.margin} onChange={(v) => setCategoryForm((s) => ({ ...s, margin: v }))} />
          <details className="md:col-span-3 rounded border p-2 text-sm">
            <summary className="cursor-pointer font-medium">Advanced fields</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <LabeledInput label="Current price (optional)" value={categoryForm.refPriceAdvanced} onChange={(v) => setCategoryForm((s) => ({ ...s, refPriceAdvanced: v }))} />
              <LabeledInput label="Implied cost (optional)" value={categoryForm.costAdvanced} onChange={(v) => setCategoryForm((s) => ({ ...s, costAdvanced: v }))} />
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={categoryForm.isActive} onChange={(e) => setCategoryForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Saving..." : "Save category rule"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">SKU Overrides</h2>
        {data.sku_overrides.length === 0 ? (
          <p className="text-sm text-gray-600">No SKU overrides yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">offer_id</th>
                  <th className="px-2 py-2">product name</th>
                  <th className="px-2 py-2">current price</th>
                  <th className="px-2 py-2">override min / max / margin</th>
                  <th className="px-2 py-2">resolved source</th>
                  <th className="px-2 py-2">action</th>
                  <th className="px-2 py-2">preview</th>
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
                        min {fmtMoney(row.min_price)} / max {fmtMoney(row.max_price)} / margin{" "}
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
                          Deactivate
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
                          Preview
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
          <LabeledInput label="sku (optional)" value={skuForm.sku} onChange={(v) => setSkuForm((s) => ({ ...s, sku: v }))} />
          <LabeledInput label="product_id (optional)" value={skuForm.productId} onChange={(v) => setSkuForm((s) => ({ ...s, productId: v }))} />
          <LabeledInput label="offer_id (optional)" value={skuForm.offerId} onChange={(v) => setSkuForm((s) => ({ ...s, offerId: v }))} />
          <LabeledInput label="Min price" value={skuForm.min} onChange={(v) => setSkuForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="Max price" value={skuForm.max} onChange={(v) => setSkuForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="Margin at current price" value={skuForm.margin} onChange={(v) => setSkuForm((s) => ({ ...s, margin: v }))} />
          <details className="md:col-span-3 rounded border p-2 text-sm">
            <summary className="cursor-pointer font-medium">Advanced fields</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <LabeledInput label="Current price (optional)" value={skuForm.refPriceAdvanced} onChange={(v) => setSkuForm((s) => ({ ...s, refPriceAdvanced: v }))} />
              <LabeledInput label="Implied cost (optional)" value={skuForm.costAdvanced} onChange={(v) => setSkuForm((s) => ({ ...s, costAdvanced: v }))} />
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skuForm.isActive} onChange={(e) => setSkuForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Saving..." : "Save SKU override"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Effective Constraints</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <LabeledInput label="Filter SKU" value={filterSku} onChange={setFilterSku} />
          <LabeledInput label="Filter product_id" value={filterProduct} onChange={setFilterProduct} />
          <LabeledInput label="Limit" value={String(limit)} onChange={(v) => setLimit(int(v) || 20)} />
          <LabeledInput label="Offset" value={String(offset)} onChange={(v) => setOffset(int(v) || 0)} />
        </div>
        <button onClick={loadEffective} disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
          {working ? "Loading..." : "Load effective constraints"}
        </button>
        {effectiveRows.length === 0 ? (
          <p className="text-sm text-gray-600">No effective constraints found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2">product / sku</th>
                  <th className="px-2 py-2">Current price</th>
                  <th className="px-2 py-2">Effective min / max</th>
                  <th className="px-2 py-2">Implied cost</th>
                  <th className="px-2 py-2">Source of constraint</th>
                  <th className="px-2 py-2">computed_at</th>
                  <th className="px-2 py-2">preview</th>
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
                        Preview
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
            total={effectiveList.total}, limit={effectiveList.limit}, offset={effectiveList.offset}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Preview</h2>
        <form onSubmit={submitPreview} className="grid gap-2 md:grid-cols-3">
          <LabeledInput label="reference_price" value={previewForm.refPrice} onChange={(v) => setPreviewForm((s) => ({ ...s, refPrice: v }))} />
          <LabeledInput label="reference_margin_percent" value={previewForm.margin} onChange={(v) => setPreviewForm((s) => ({ ...s, margin: v }))} />
          <LabeledInput label="min_price (optional)" value={previewForm.min} onChange={(v) => setPreviewForm((s) => ({ ...s, min: v }))} />
          <LabeledInput label="max_price (optional)" value={previewForm.max} onChange={(v) => setPreviewForm((s) => ({ ...s, max: v }))} />
          <LabeledInput label="input_price (optional)" value={previewForm.input} onChange={(v) => setPreviewForm((s) => ({ ...s, input: v }))} />
          <div className="md:col-span-3">
            <button type="submit" disabled={working} className="rounded border px-3 py-2 hover:bg-gray-50">
              {working ? "Calculating..." : "Calculate preview"}
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
          <p className="text-sm text-gray-600">Submit preview inputs to see calculated explainability values.</p>
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

