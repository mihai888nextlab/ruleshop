export type DecisionType =
  | "pricing"
  | "shipping"
  | "fraud"
  | "availability"
  | "loyalty"
  | "theme";

export type ComparisonOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "contains"
  | "exists";

export type Condition =
  | { op: "and" | "or"; children: Condition[] }
  | { op: "not"; child: Condition }
  | { op: ComparisonOp; path: string; value?: unknown };

export type GroupCondition = Extract<Condition, { children: Condition[] }>;
export type NotCondition = Extract<Condition, { child: Condition }>;
export type ComparisonCondition = Extract<Condition, { path: string }>;

/**
 * Explicit guards rather than inline `op` checks.
 *
 * The group variant's discriminant is itself a union (`"and" | "or"`), which
 * TypeScript will not fully eliminate from a negated `||` chain. These also
 * read better at the call sites that walk the tree.
 */
export function isGroupCondition(cond: Condition): cond is GroupCondition {
  return cond.op === "and" || cond.op === "or";
}

export function isNotCondition(cond: Condition): cond is NotCondition {
  return cond.op === "not";
}

export function isComparisonCondition(
  cond: Condition,
): cond is ComparisonCondition {
  return !isGroupCondition(cond) && !isNotCondition(cond);
}

export type Action =
  | { type: "set"; path: string; value: unknown }
  | { type: "discountPercent"; value: number }
  | { type: "setFixedPrice"; value: number }
  | { type: "setShipping"; method: string; cost: number }
  | { type: "addShippingOption"; method: string; cost: number; label?: string }
  | { type: "blockCheckout"; reason: string }
  | { type: "flagFraud"; score: number; reason?: string }
  | { type: "setAvailability"; available: boolean; reason?: string }
  | { type: "grantLoyalty"; points: number }
  | { type: "setTheme"; themeId: string };

export interface RuleDefinition {
  id?: string;
  key: string;
  name: string;
  description?: string;
  category: DecisionType;
  priority: number;
  enabled: boolean;
  conditions: Condition;
  actions: Action[];
}

export interface EvaluationInput {
  decisionType: DecisionType;
  context: Record<string, unknown>;
  rules: RuleDefinition[];
  /** Categories killed for this store */
  killedCategories?: DecisionType[];
  killAll?: boolean;
}

export interface MatchedRuleInfo {
  key: string;
  name: string;
  priority: number;
  actions: Action[];
}

export interface ExplanationStep {
  ruleKey: string;
  ruleName: string;
  matched: boolean;
  reason: string;
  appliedActions?: Action[];
}

export interface EvaluationResult {
  decision: Record<string, unknown>;
  matchedRules: string[];
  matchedRuleDetails: MatchedRuleInfo[];
  explanation: ExplanationStep[];
  warnings: string[];
  traceId: string;
}

export const ACTION_PATHS: Record<string, string> = {
  discountPercent: "discountPercent",
  setFixedPrice: "fixedPrice",
  setShipping: "shipping",
  addShippingOption: "shippingOptions",
  blockCheckout: "blocked",
  flagFraud: "fraud",
  setAvailability: "availability",
  grantLoyalty: "loyaltyPoints",
  setTheme: "themeId",
};
