import { z } from "zod";

/**
 * Wire contract for the decisioning API.
 *
 * The control plane validates incoming requests with these schemas and the
 * storefront parses responses with them, so a drift between the two apps
 * fails loudly at the boundary instead of silently rendering wrong prices.
 */

export const decisionTypeSchema = z.enum([
  "pricing",
  "shipping",
  "fraud",
  "availability",
  "loyalty",
  "theme",
]);

export type DecisionTypeWire = z.infer<typeof decisionTypeSchema>;

export const decideRequestSchema = z.object({
  storeSlug: z.string().min(1),
  decisionType: decisionTypeSchema,
  /** Facts the rules are evaluated against. Server-owned facts are merged in server-side. */
  context: z.record(z.string(), z.unknown()).default({}),
  /**
   * Stable identity used for deterministic canary bucketing. Omit to let the
   * server derive it from the bearer token or the X-Guest-Id header.
   */
  subjectKey: z.string().min(1).optional(),
  /** Whether to record this evaluation in the audit-visible history. */
  persist: z.boolean().optional(),
  /**
   * Evaluate against a specific ruleset version instead of the live one.
   * Restricted to store staff: it can read unpublished drafts.
   */
  rulesetVersion: z.number().int().positive().optional(),
});

export type DecideRequest = z.input<typeof decideRequestSchema>;

/** One line of the "why did this happen" trace, per rule considered. */
export const explanationStepSchema = z.object({
  ruleKey: z.string(),
  ruleName: z.string(),
  matched: z.boolean(),
  reason: z.string(),
  appliedActions: z.array(z.unknown()).optional(),
});

export const matchedRuleSchema = z.object({
  key: z.string(),
  name: z.string(),
  priority: z.number(),
  actions: z.array(z.unknown()),
});

export const decideResponseSchema = z.object({
  decision: z.record(z.string(), z.unknown()),
  rulesetVersion: z.number().int().nullable(),
  matchedRules: z.array(z.string()),
  matchedRuleDetails: z.array(matchedRuleSchema),
  explanation: z.array(explanationStepSchema),
  warnings: z.array(z.string()),
  traceId: z.string(),
  isCanary: z.boolean(),
  evaluationId: z.string().optional(),
});

export type DecideResponse = z.infer<typeof decideResponseSchema>;
export type ExplanationStep = z.infer<typeof explanationStepSchema>;
export type MatchedRule = z.infer<typeof matchedRuleSchema>;

/**
 * Decision payload shapes the storefront reads. The engine produces an open
 * record, so these are narrowing helpers rather than a closed schema: a rule
 * may legitimately set keys the storefront does not know about yet.
 */
export function readNumber(
  decision: Record<string, unknown>,
  key: string,
): number | null {
  const v = decision[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function readString(
  decision: Record<string, unknown>,
  key: string,
): string | null {
  const v = decision[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function readBoolean(
  decision: Record<string, unknown>,
  key: string,
): boolean | null {
  const v = decision[key];
  return typeof v === "boolean" ? v : null;
}

export const shippingOptionSchema = z.object({
  method: z.string(),
  cost: z.number(),
  label: z.string().optional(),
});

export type ShippingOption = z.infer<typeof shippingOptionSchema>;

export function readShippingOptions(
  decision: Record<string, unknown>,
): ShippingOption[] {
  const parsed = z.array(shippingOptionSchema).safeParse(decision.shippingOptions);
  return parsed.success ? parsed.data : [];
}

export const availabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable().optional(),
});

export function readAvailability(decision: Record<string, unknown>) {
  const parsed = availabilitySchema.safeParse(decision.availability);
  return parsed.success ? parsed.data : null;
}

export const fraudSchema = z.object({
  score: z.number(),
  reason: z.string().nullable().optional(),
});

export function readFraud(decision: Record<string, unknown>) {
  const parsed = fraudSchema.safeParse(decision.fraud);
  return parsed.success ? parsed.data : null;
}
