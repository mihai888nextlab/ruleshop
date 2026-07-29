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

export const profileResponseSchema = z.object({
  fields: z.array(profileFieldSchema),
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
