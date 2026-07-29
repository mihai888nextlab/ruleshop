import { z } from "zod";
import type { Action, Condition, RuleDefinition } from "./types";

const comparisonOp = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "exists",
]);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      op: z.enum(["and", "or"]),
      children: z.array(conditionSchema),
    }),
    z.object({
      op: z.literal("not"),
      child: conditionSchema,
    }),
    z.object({
      op: comparisonOp,
      path: z.string().min(1),
      value: z.unknown().optional(),
    }),
  ]),
);

export const actionSchema: z.ZodType<Action> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set"),
    path: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal("discountPercent"),
    value: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal("setFixedPrice"),
    value: z.number().min(0),
  }),
  z.object({
    type: z.literal("setShipping"),
    method: z.string().min(1),
    cost: z.number().min(0),
  }),
  z.object({
    type: z.literal("addShippingOption"),
    method: z.string().min(1),
    cost: z.number().min(0),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal("blockCheckout"),
    reason: z.string().min(1),
  }),
  z.object({
    type: z.literal("flagFraud"),
    score: z.number().min(0).max(100),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("setAvailability"),
    available: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("grantLoyalty"),
    points: z.number().int(),
  }),
  z.object({
    type: z.literal("setTheme"),
    themeId: z.string().min(1),
  }),
]);

export const ruleDefinitionSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "key trebuie să fie slug (a-z, 0-9, -)"),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum([
    "pricing",
    "shipping",
    "fraud",
    "availability",
    "loyalty",
    "theme",
  ]),
  priority: z.number().int(),
  enabled: z.boolean(),
  conditions: conditionSchema,
  actions: z.array(actionSchema).min(1),
});

export function validateRule(rule: unknown): {
  ok: boolean;
  data?: RuleDefinition;
  errors: string[];
} {
  const parsed = ruleDefinitionSchema.safeParse(rule);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "rule"}: ${i.message}`,
      ),
    };
  }
  return { ok: true, data: parsed.data, errors: [] };
}

export function validateRuleset(rules: unknown[]): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (let i = 0; i < rules.length; i++) {
    const v = validateRule(rules[i]);
    if (!v.ok) {
      errors.push(...v.errors.map((e) => `rules[${i}]: ${e}`));
      continue;
    }
    if (keys.has(v.data!.key)) {
      errors.push(`rules[${i}]: cheie duplicată "${v.data!.key}"`);
    }
    keys.add(v.data!.key);
  }
  return { ok: errors.length === 0, errors };
}
