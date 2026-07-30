import { z } from "zod";

/** Public store identity. Deliberately excludes anything operational. */
export const storeSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
});

export type StoreSummary = z.infer<typeof storeSummarySchema>;

export const storeListResponseSchema = z.object({
  stores: z.array(storeSummarySchema),
});

/**
 * Uniform error body for every control-plane endpoint, so the storefront can
 * surface a cause without needing per-endpoint error handling.
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * SPA bootstrap: store identity + theme tokens from the engine.
 * Theme shape mirrors resolvedThemeSchema without importing theme.ts (avoids
 * a circular contracts load when index re-exports both modules).
 */
export const bootstrapResponseSchema = z.object({
  storeId: z.string(),
  storeName: z.string(),
  slug: z.string(),
  theme: z.object({
    key: z.string().nullable(),
    name: z.string(),
    tokens: z.record(z.string(), z.unknown()),
    fallback: z.boolean(),
  }),
});

export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
