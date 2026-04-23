import { apiGet, apiPost, apiPut } from "@/lib/api";

export type PricingRule = {
  id: number;
  scope_type: "global_default" | "category_rule" | "sku_override";
  scope_target_id: number | null;
  scope_target_code: string | null;
  min_price: number | null;
  max_price: number | null;
  reference_margin_percent: number | null;
  reference_price: number | null;
  implied_cost: number | null;
  is_active: boolean;
  updated_at: string;
};

export type PricingConstraintsResponse = {
  global_default: PricingRule | null;
  category_rules: PricingRule[];
  sku_overrides: PricingRule[];
  category_options: {
    description_category_id: number;
    products_count: number;
  }[];
  product_catalog: {
    ozon_product_id: number;
    sku: number | null;
    offer_id: string | null;
    product_name: string;
    description_category_id: number | null;
    current_price: number | null;
  }[];
  meta: {
    total_rules: number;
    active_rules: number;
    category_rules_count: number;
    sku_overrides_count: number;
    last_rule_update_at: string | null;
    last_recompute_at: string | null;
    effective_records_count: number;
  };
};

export type RulePayload = {
  min_price?: number;
  max_price?: number;
  reference_margin_percent?: number;
  reference_price?: number;
  implied_cost?: number;
  is_active?: boolean;
};

export type CategoryRulePayload = RulePayload & {
  description_category_id: number;
  category_code?: string;
};

export type SKUOverridePayload = RulePayload & {
  sku?: number;
  product_id?: number;
  offer_id?: string;
};

export type UpsertRuleResponse = {
  rule: PricingRule;
  recompute: {
    SellerAccountID: number;
    ProductsScanned: number;
    MaterializedCount: number;
    NoConstraintsCount: number;
    SkippedInvalidInputs: number;
    ComputedAt: string;
  };
};

export type EffectiveConstraint = {
  ozon_product_id: number;
  sku: number | null;
  offer_id: string | null;
  product_name: string | null;
  current_price: number | null;
  resolved_from_scope_type: string;
  rule_id: number;
  effective_min_price: number | null;
  effective_max_price: number | null;
  reference_price: number | null;
  reference_margin_percent: number | null;
  implied_cost: number | null;
  computed_at: string;
};

export type EffectiveListResponse = {
  items: EffectiveConstraint[];
  total: number;
  limit: number;
  offset: number;
};

export type EffectiveQuery = {
  sku?: number;
  productId?: number;
  limit?: number;
  offset?: number;
};

export type PreviewPayload = {
  reference_price: number;
  reference_margin_percent: number;
  min_price?: number;
  max_price?: number;
  input_price?: number;
};

export type PreviewResponse = {
  reference_price: number;
  reference_margin_percent: number;
  implied_cost: number;
  expected_margin_at_min_price: number | null;
  expected_margin_at_max_price: number | null;
  expected_margin_at_input_price: number | null;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getPricingConstraints(): Promise<PricingConstraintsResponse> {
  return apiGet<PricingConstraintsResponse>("/api/v1/pricing-constraints");
}

export function putGlobalDefault(payload: RulePayload): Promise<UpsertRuleResponse> {
  return apiPut<UpsertRuleResponse>("/api/v1/pricing-constraints/global", payload);
}

export function postCategoryRule(payload: CategoryRulePayload): Promise<UpsertRuleResponse> {
  return apiPost<UpsertRuleResponse>("/api/v1/pricing-constraints/category-rules", payload);
}

export function postSKUOverride(payload: SKUOverridePayload): Promise<UpsertRuleResponse> {
  return apiPost<UpsertRuleResponse>("/api/v1/pricing-constraints/sku-overrides", payload);
}

export async function getEffectiveConstraints(
  query: EffectiveQuery
): Promise<EffectiveListResponse | EffectiveConstraint> {
  const suffix = buildQuery({
    sku: query.sku,
    product_id: query.productId,
    limit: query.limit,
    offset: query.offset,
  });
  return apiGet<EffectiveListResponse | EffectiveConstraint>(
    `/api/v1/pricing-constraints/effective${suffix}`
  );
}

export function postPreview(payload: PreviewPayload): Promise<PreviewResponse> {
  return apiPost<PreviewResponse>("/api/v1/pricing-constraints/preview", payload);
}
