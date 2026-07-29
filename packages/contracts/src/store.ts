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
