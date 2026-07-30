import { z } from "zod";
import { explanationStepSchema } from "./decision";
import { resolvedThemeSchema } from "./theme";

/**
 * Catalog contracts.
 *
 * Every price the storefront displays is accompanied by the decision metadata
 * that produced it. That is deliberate: the shop is required to make rule
 * engine decisions visible, and shipping the explanation alongside the number
 * means the UI can never show a price whose origin it cannot account for.
 */

/** Provenance for a single decision, embedded next to the values it produced. */
export const decisionMetaSchema = z.object({
  rulesetVersion: z.number().int().nullable(),
  matchedRules: z.array(z.string()),
  traceId: z.string(),
  isCanary: z.boolean(),
  /** Omitted on list endpoints to keep catalog payloads small. */
  explanation: z.array(explanationStepSchema).optional(),
  warnings: z.array(z.string()).default([]),
});

export type DecisionMeta = z.infer<typeof decisionMetaSchema>;

/**
 * The theme in force for this request.
 *
 * Carries the resolved token values, not just an identifier, so the storefront
 * can apply a theme an administrator composed without knowing it exists.
 */
export const themeSchema = z.object({
  themeId: z.string(),
  resolved: resolvedThemeSchema,
  decision: decisionMetaSchema,
});

/** Store envelope returned with every storefront read. */
export const storeContextSchema = z.object({
  slug: z.string(),
  name: z.string(),
  theme: themeSchema,
});

export type StoreContext = z.infer<typeof storeContextSchema>;

export const pricedProductSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  imageUrl: z.string().nullable(),

  /** Catalogue price before any rule ran. */
  basePrice: z.number(),
  /** What the customer actually pays, after pricing rules. */
  finalPrice: z.number(),
  discountPercent: z.number(),

  /**
   * Availability is a rule decision, not just a stock count: a rule may hide a
   * product that is physically in stock, or keep selling one that is not.
   */
  available: z.boolean(),
  availabilityReason: z.string().nullable(),
  /** Coarse stock signal only — exact inventory is not public. */
  stockLevel: z.enum(["out", "low", "ok"]),

  pricingDecision: decisionMetaSchema,
  availabilityDecision: decisionMetaSchema,
});

export type PricedProduct = z.infer<typeof pricedProductSchema>;

export const catalogResponseSchema = z.object({
  store: storeContextSchema,
  products: z.array(pricedProductSchema),
  categories: z.array(z.string()),
});

export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export const productDetailResponseSchema = z.object({
  store: storeContextSchema,
  product: pricedProductSchema,
});

export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
});
