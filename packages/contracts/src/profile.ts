import { z } from "zod";

/**
 * Customer profile contracts.
 *
 * The storefront does not know what fields a store has: it asks, renders what it
 * is told, and submits values back. That is what lets an administrator add a
 * segmentation dimension without a storefront deploy.
 */

export const attributeTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "enum",
  "date",
]);

export type AttributeTypeWire = z.infer<typeof attributeTypeSchema>;

/** One field to render, as declared by the store administrator. */
export const profileFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  type: attributeTypeSchema,
  options: z.array(z.string()),
  required: z.boolean(),
  /** Current value, or null when the customer has not supplied one. */
  value: z.unknown().nullable(),
});

export type ProfileField = z.infer<typeof profileFieldSchema>;

/** Tier names the engine exposes at `customer.tier`. */
export const customerTierSchema = z.enum(["guest", "standard", "vip"]);

export type CustomerTier = z.infer<typeof customerTierSchema>;

/**
 * The customer's loyalty standing in this store.
 *
 * Carried with the profile because the balance is per store: the same account
 * can be VIP in one shop and brand new in another, so a single global number
 * would be wrong. `vipThreshold` ships with it so the shop can show how far off
 * the next tier is without hard-coding a number the control plane owns.
 */
export const loyaltyBalanceSchema = z.object({
  points: z.number().int(),
  tier: customerTierSchema,
  vipThreshold: z.number().int(),
});

export type LoyaltyBalance = z.infer<typeof loyaltyBalanceSchema>;

export const profileResponseSchema = z.object({
  fields: z.array(profileFieldSchema),
  loyalty: loyaltyBalanceSchema,
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const profileUpdateRequestSchema = z.object({
  /** Keys not defined by the store are ignored rather than rejected. */
  values: z.record(z.string(), z.unknown()),
});

/** Field-level errors, keyed by attribute, so a form can render them inline. */
export const profileUpdateResponseSchema = z.object({
  ok: z.boolean(),
  fields: z.array(profileFieldSchema),
  errors: z.record(z.string(), z.string()),
});

export type ProfileUpdateResponse = z.infer<typeof profileUpdateResponseSchema>;
