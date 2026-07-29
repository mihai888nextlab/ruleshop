import { z } from "zod";

/**
 * Customer authentication for the storefront.
 *
 * The password policy lives here so both sides agree on it: the storefront can
 * give immediate feedback and the control plane enforces the same rule on the
 * server, where it actually counts.
 */

export const passwordSchema = z
  .string()
  .min(8, "Parola trebuie să aibă minim 8 caractere")
  .max(200, "Parola este prea lungă");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Adresă de email invalidă")
  .max(200);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  /** Not length-validated on login: rejecting by length leaks policy detail. */
  password: z.string().min(1).max(200),
});

export const customerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  loyaltyPoints: z.number().int(),
});

export type Customer = z.infer<typeof customerSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number().int(),
  customer: customerSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const sessionResponseSchema = z.object({
  customer: customerSchema.nullable(),
});
