import { z } from "zod";
import {
  OPERATORS_BY_TYPE,
  fieldValueError,
  findField,
  typeName,
  type ContextSchema,
} from "./schema";
import {
  isGroupCondition,
  isNotCondition,
  type Action,
  type ComparisonCondition,
  type Condition,
  type DecisionType,
  type RuleDefinition,
} from "./types";

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

/**
 * Guards against pathological rules. A deeply nested condition tree costs
 * recursion on every evaluation, and rules run on customer-facing request paths.
 */
const MAX_CONDITION_DEPTH = 20;

export interface ValidationOptions {
  /**
   * Typed catalogue of readable facts. When supplied, conditions are checked
   * semantically: unknown paths, operators that do not suit the field's type,
   * and values of the wrong type are all rejected.
   *
   * Omit it for structural validation only — the engine's own unit tests, and
   * any caller with no store context.
   */
  schema?: ContextSchema;
}

function checkComparison(
  cond: ComparisonCondition,
  schema: ContextSchema,
  decisionType: DecisionType,
  where: string,
): string[] {
  const errors: string[] = [];
  const field = findField(schema, cond.path);

  if (!field) {
    errors.push(`${where}: câmpul "${cond.path}" nu există în schema magazinului`);
    return errors;
  }

  if (field.availableIn && !field.availableIn.includes(decisionType)) {
    errors.push(
      `${where}: câmpul "${cond.path}" nu este disponibil pentru decizii de tip "${decisionType}"`,
    );
  }

  const allowed = OPERATORS_BY_TYPE[field.type];
  if (!allowed.includes(cond.op)) {
    errors.push(
      `${where}: operatorul "${cond.op}" nu se poate aplica pe "${cond.path}" ` +
        `(tip ${typeName(field.type)}). Operatori permiși: ${allowed.join(", ")}`,
    );
    // Checking the value would be misleading for an operator that cannot apply.
    return errors;
  }

  // `exists` asks only whether the fact was supplied, so it carries no value.
  if (cond.op === "exists") return errors;

  if (cond.op === "in") {
    if (!Array.isArray(cond.value)) {
      errors.push(`${where}: operatorul "in" așteaptă o listă de valori`);
      return errors;
    }
    if (cond.value.length === 0) {
      errors.push(`${where}: lista pentru "in" este goală`);
      return errors;
    }
    cond.value.forEach((item, i) => {
      const problem = fieldValueError(field, item);
      if (problem) {
        errors.push(`${where}: elementul ${i + 1} din listă ${problem}`);
      }
    });
    return errors;
  }

  if (cond.op === "contains") {
    // A substring test, so the operand is text even when the field is a list.
    if (typeof cond.value !== "string" || cond.value.length === 0) {
      errors.push(`${where}: operatorul "conține" așteaptă un text`);
    }
    return errors;
  }

  const problem = fieldValueError(field, cond.value);
  if (problem) {
    errors.push(`${where}: "${cond.path}" ${problem}`);
  }

  return errors;
}

function checkCondition(
  cond: Condition,
  schema: ContextSchema | undefined,
  decisionType: DecisionType,
  path: string,
  depth: number,
): string[] {
  if (depth > MAX_CONDITION_DEPTH) {
    return [
      `${path}: condițiile depășesc adâncimea maximă (${MAX_CONDITION_DEPTH})`,
    ];
  }

  if (isGroupCondition(cond)) {
    // An empty AND is vacuously true and an empty OR is vacuously false. Both
    // are far more likely an unfinished edit than an intent.
    if (cond.children.length === 0) {
      return [
        `${path}: grupul "${cond.op.toUpperCase()}" nu conține nicio condiție`,
      ];
    }
    return cond.children.flatMap((child, i) =>
      checkCondition(
        child,
        schema,
        decisionType,
        `${path}.${cond.op}[${i}]`,
        depth + 1,
      ),
    );
  }

  if (isNotCondition(cond)) {
    return checkCondition(
      cond.child,
      schema,
      decisionType,
      `${path}.not`,
      depth + 1,
    );
  }

  if (!schema) return [];
  return checkComparison(cond, schema, decisionType, path);
}

export function validateRule(
  rule: unknown,
  options: ValidationOptions = {},
): {
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

  const semantic = checkCondition(
    parsed.data.conditions,
    options.schema,
    parsed.data.category,
    "conditions",
    0,
  );

  if (semantic.length > 0) {
    return { ok: false, data: parsed.data, errors: semantic };
  }

  return { ok: true, data: parsed.data, errors: [] };
}

export function validateRuleset(
  rules: unknown[],
  options: ValidationOptions = {},
): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const keys = new Set<string>();

  for (let i = 0; i < rules.length; i++) {
    const v = validateRule(rules[i], options);
    const label = v.data?.key ? `"${v.data.key}"` : `rules[${i}]`;

    if (!v.ok) {
      errors.push(...v.errors.map((e) => `${label}: ${e}`));
      continue;
    }
    if (keys.has(v.data!.key)) {
      errors.push(`${label}: cheie duplicată`);
    }
    keys.add(v.data!.key);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Which context paths a condition tree reads.
 *
 * Used to refuse deletion of a customer attribute that live rules depend on:
 * removing it would leave conditions pointing at a field that no longer exists.
 */
export function collectReferencedPaths(conditions: Condition): Set<string> {
  const paths = new Set<string>();

  const walk = (cond: Condition) => {
    if (isGroupCondition(cond)) {
      cond.children.forEach(walk);
      return;
    }
    if (isNotCondition(cond)) {
      walk(cond.child);
      return;
    }
    paths.add(cond.path);
  };

  walk(conditions);
  return paths;
}
