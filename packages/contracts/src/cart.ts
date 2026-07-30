import { z } from "zod";
import { decisionMetaSchema, storeContextSchema } from "./catalog";
import { shippingOptionSchema } from "./decision";

/**
 * Cart and checkout contracts.
 *
 * Every monetary figure here is computed by the control plane from published
 * rules. The storefront submits what the customer chose — quantities and a
 * shipping method — never a price. Anything else would let a client set its own
 * total.
 */

export const cartLineSchema = z.object({
  productSlug: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  /** Catalogue price before rules. */
  unitBasePrice: z.number(),
  /** Price after pricing rules for this customer. */
  unitPrice: z.number(),
  lineTotal: z.number(),
  discountPercent: z.number(),
  /** Available stock, so the UI can cap the quantity control. */
  availableStock: z.number().int(),
  pricingDecision: decisionMetaSchema,
});

export type CartLine = z.infer<typeof cartLineSchema>;

export const loyaltyPreviewSchema = z.object({
  points: z.number().int(),
  decision: decisionMetaSchema,
});

export const cartResponseSchema = z.object({
  store: storeContextSchema,
  lines: z.array(cartLineSchema),
  subtotal: z.number(),
  /** Sum of per-line savings versus catalogue prices. */
  discountTotal: z.number(),
  shippingOptions: z.array(shippingOptionSchema),
  shippingDecision: decisionMetaSchema,
  loyalty: loyaltyPreviewSchema,
  /**
   * The fraud evaluation for this cart, exposed even when it does not block, so
   * checkout can show what the antifraud rules concluded rather than only
   * reporting a refusal.
   */
  fraudDecision: decisionMetaSchema,
  /** Set when a fraud rule would block checkout, so the UI can warn early. */
  blockedReason: z.string().nullable(),
  /** True when a guest cart was folded into the signed-in customer's cart. */
  merged: z.boolean(),
  /**
   * Who the control plane actually served this request as.
   *
   * The storefront cannot infer this from its own cookie: a token can be present
   * but expired, or name an account that no longer exists, in which case the API
   * treats the caller as a guest. Reporting it here keeps the shop's header from
   * claiming a session the API does not recognise.
   */
  viewer: z.object({
    authenticated: z.boolean(),
    email: z.string().nullable(),
  }),
});

export type CartResponse = z.infer<typeof cartResponseSchema>;

export const cartItemRequestSchema = z.object({
  productSlug: z.string().min(1).max(200),
  /** Absolute quantity. Zero removes the line. */
  quantity: z.number().int().min(0).max(99),
});

export const checkoutRequestSchema = z.object({
  shippingMethod: z.string().min(1).max(60),
  /** Required for guest checkout; ignored when authenticated. */
  guestEmail: z.string().trim().toLowerCase().email().max(200).optional(),
  /**
   * Token that makes this checkout idempotent. Retrying with the same token
   * returns the original order rather than placing another.
   */
  idempotencyKey: z.string().min(8).max(120),
});

export const orderItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number(),
  lineTotal: z.number(),
});

export const orderSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "PAID", "SHIPPED", "CANCELLED", "BLOCKED"]),
  createdAt: z.string(),
  subtotal: z.number(),
  discountTotal: z.number(),
  shippingCost: z.number(),
  shippingMethod: z.string().nullable(),
  total: z.number(),
  loyaltyPointsEarned: z.number().int(),
  items: z.array(orderItemSchema),
});

export type OrderSummary = z.infer<typeof orderSummarySchema>;

/**
 * The decisions that produced an order, kept with it.
 *
 * Stored at checkout rather than recomputed on read: rules change, and an order
 * must always be explainable by the rules that actually priced it.
 */
export const orderDecisionsSchema = z.object({
  pricing: z.array(decisionMetaSchema).default([]),
  shipping: decisionMetaSchema.nullable().default(null),
  fraud: decisionMetaSchema.nullable().default(null),
  loyalty: decisionMetaSchema.nullable().default(null),
});

export const orderDetailResponseSchema = z.object({
  order: orderSummarySchema,
  decisions: orderDecisionsSchema,
});

export const orderListResponseSchema = z.object({
  orders: z.array(orderSummarySchema),
});

export const checkoutResponseSchema = z.object({
  order: orderSummarySchema,
  /** True when this response replays an earlier identical request. */
  replayed: z.boolean(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
