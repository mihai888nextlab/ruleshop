import type { Prisma } from "@prisma/client";
import type {
  CatalogResponse,
  DecisionMeta,
  PricedProduct,
  StoreContext,
} from "@ruleshop/contracts";
import type { ApiIdentity } from "./api-identity";
import { buildCustomerFacts, type CustomerFacts } from "./customer-facts";
import {
  runDecisionBatch,
  type DecisionOutcome,
  type ResolvedRuleset,
} from "./decide";
import { prisma } from "./prisma";

/**
 * Read side of the storefront API.
 *
 * Prices and availability are computed here, server-side, and handed to the
 * storefront as finished numbers with their explanation attached. The storefront
 * cannot recompute or override them, which is both the security property and
 * the reason the decisioning API is genuinely in the request path.
 */

const LOW_STOCK_THRESHOLD = 5;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type ProductRow = {
  slug: string;
  name: string;
  description: string;
  category: string;
  basePrice: Prisma.Decimal;
  stock: number;
  imageUrl: string | null;
};

/** Strip the full trace for list responses; keep it for detail responses. */
function toDecisionMeta(
  outcome: Omit<DecisionOutcome, "evaluationId">,
  includeExplanation: boolean,
): DecisionMeta {
  return {
    rulesetVersion: outcome.rulesetVersion,
    matchedRules: outcome.matchedRules,
    traceId: outcome.traceId,
    isCanary: outcome.isCanary,
    warnings: outcome.warnings,
    ...(includeExplanation ? { explanation: outcome.explanation } : {}),
  };
}

function productContext(product: ProductRow, customer: CustomerFacts) {
  return {
    customer,
    product: {
      slug: product.slug,
      category: product.category,
      basePrice: Number(product.basePrice.toString()),
      stock: product.stock,
      inStock: product.stock > 0,
    },
  };
}

function stockLevel(stock: number): PricedProduct["stockLevel"] {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

/**
 * Applies pricing actions to a base price.
 *
 * `fixedPrice` wins over `discountPercent` when a rule sets both, because a
 * fixed price is an explicit statement of the final number while a percentage
 * is a modifier. The engine's own conflict resolution has already decided which
 * rule owns each of those keys before we get here.
 */
function applyPricing(
  basePrice: number,
  decision: Record<string, unknown>,
): { finalPrice: number; discountPercent: number } {
  const fixed = decision.fixedPrice;
  if (typeof fixed === "number" && Number.isFinite(fixed) && fixed >= 0) {
    const effectiveDiscount =
      basePrice > 0 ? ((basePrice - fixed) / basePrice) * 100 : 0;
    return {
      finalPrice: roundMoney(fixed),
      discountPercent: roundMoney(Math.max(0, effectiveDiscount)),
    };
  }

  const raw = decision.discountPercent;
  const percent =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(100, Math.max(0, raw))
      : 0;

  return {
    finalPrice: roundMoney(basePrice * (1 - percent / 100)),
    discountPercent: roundMoney(percent),
  };
}

function toPricedProduct(
  product: ProductRow,
  pricing: Omit<DecisionOutcome, "evaluationId">,
  availability: Omit<DecisionOutcome, "evaluationId">,
  includeExplanation: boolean,
): PricedProduct {
  const basePrice = roundMoney(Number(product.basePrice.toString()));
  const { finalPrice, discountPercent } = applyPricing(
    basePrice,
    pricing.decision,
  );

  const availabilityDecision = availability.decision.availability as
    | { available?: boolean; reason?: string | null }
    | undefined;

  // A rule may hide an in-stock product or keep an out-of-stock one listed;
  // stock is the default only when no rule expressed an opinion.
  const ruleSaysAvailable = availabilityDecision?.available;
  const available =
    typeof ruleSaysAvailable === "boolean"
      ? ruleSaysAvailable && product.stock > 0
      : product.stock > 0;

  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category,
    imageUrl: product.imageUrl,
    basePrice,
    finalPrice,
    discountPercent,
    available,
    availabilityReason: availabilityDecision?.reason ?? null,
    stockLevel: stockLevel(product.stock),
    pricingDecision: toDecisionMeta(pricing, includeExplanation),
    availabilityDecision: toDecisionMeta(availability, includeExplanation),
  };
}

async function themeContext(
  storeSlug: string,
  storeName: string,
  resolved: ResolvedRuleset,
  themeOutcome: Omit<DecisionOutcome, "evaluationId">,
): Promise<StoreContext> {
  void resolved;
  const themeId =
    typeof themeOutcome.decision.themeId === "string"
      ? themeOutcome.decision.themeId
      : "default";

  return {
    slug: storeSlug,
    name: storeName,
    theme: { themeId, decision: toDecisionMeta(themeOutcome, false) },
  };
}

export async function findStoreBySlug(slug: string) {
  return prisma.store.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}

/**
 * One catalog read: resolve the ruleset once, then evaluate theme plus pricing
 * and availability for every product in a single bulk persist.
 */
export async function buildCatalog(input: {
  store: { id: string; slug: string; name: string };
  identity: ApiIdentity;
  filter: { q?: string; category?: string };
}): Promise<CatalogResponse> {
  const { store, identity, filter } = input;

  const [products, categoryRows, customer] = await Promise.all([
    prisma.product.findMany({
      where: {
        storeId: store.id,
        active: true,
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: "insensitive" } },
                { description: { contains: filter.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        slug: true,
        name: true,
        description: true,
        category: true,
        basePrice: true,
        stock: true,
        imageUrl: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { storeId: store.id, active: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
    buildCustomerFacts(store.id, identity),
  ]);

  const items: {
    key: string;
    decisionType: "pricing" | "availability" | "theme";
    context: Record<string, unknown>;
  }[] = [
    {
      key: "theme",
      decisionType: "theme",
      context: { store: { slug: store.slug }, customer },
    },
  ];

  for (const product of products) {
    const context = productContext(product, customer);
    items.push({
      key: `pricing:${product.slug}`,
      decisionType: "pricing",
      context: { store: { slug: store.slug }, ...context },
    });
    items.push({
      key: `availability:${product.slug}`,
      decisionType: "availability",
      context: { store: { slug: store.slug }, ...context },
    });
  }

  const { outcomes, resolved } = await runDecisionBatch({
    storeId: store.id,
    subjectKey: identity.subjectKey,
    items,
  });

  const themeOutcome = outcomes.get("theme")!;

  return {
    store: await themeContext(store.slug, store.name, resolved, themeOutcome),
    products: products.map((product) =>
      toPricedProduct(
        product,
        outcomes.get(`pricing:${product.slug}`)!,
        outcomes.get(`availability:${product.slug}`)!,
        false,
      ),
    ),
    categories: categoryRows.map((row) => row.category),
  };
}

/** Product detail: same decisions, but the full explanation is included. */
export async function buildProductDetail(input: {
  store: { id: string; slug: string; name: string };
  identity: ApiIdentity;
  productSlug: string;
}): Promise<{ store: StoreContext; product: PricedProduct } | null> {
  const { store, identity, productSlug } = input;

  const [product, customer] = await Promise.all([
    prisma.product.findUnique({
      where: { storeId_slug: { storeId: store.id, slug: productSlug } },
      select: {
        slug: true,
        name: true,
        description: true,
        category: true,
        basePrice: true,
        stock: true,
        imageUrl: true,
        active: true,
      },
    }),
    buildCustomerFacts(store.id, identity),
  ]);

  if (!product || !product.active) return null;

  const context = productContext(product, customer);
  const { outcomes, resolved } = await runDecisionBatch({
    storeId: store.id,
    subjectKey: identity.subjectKey,
    items: [
      {
        key: "theme",
        decisionType: "theme",
        context: { store: { slug: store.slug }, customer },
      },
      {
        key: "pricing",
        decisionType: "pricing",
        context: { store: { slug: store.slug }, ...context },
      },
      {
        key: "availability",
        decisionType: "availability",
        context: { store: { slug: store.slug }, ...context },
      },
    ],
  });

  return {
    store: await themeContext(
      store.slug,
      store.name,
      resolved,
      outcomes.get("theme")!,
    ),
    product: toPricedProduct(
      product,
      outcomes.get("pricing")!,
      outcomes.get("availability")!,
      true,
    ),
  };
}
