import type { DecisionType, Prisma } from "@prisma/client";
import { evaluate } from "@ruleshop/engine";
import type {
  DecisionType as EngineDecisionType,
  EvaluationResult,
  RuleDefinition,
} from "@ruleshop/engine";
import { isInCanary } from "./canary";
import { prisma } from "./prisma";
import { parseKillCategories } from "./store";

/**
 * Decision service: resolves which ruleset a subject should see, runs the
 * engine, and records the evaluation for the history and audit views.
 *
 * Ruleset resolution is deliberately separate from evaluation so a page needing
 * many decisions (a catalog pricing every product) resolves once and evaluates
 * many times, instead of re-reading the deployment per item.
 */

export type ResolvedRuleset = NonNullable<
  Awaited<ReturnType<typeof resolveRulesetForSubject>>
>;

export async function resolveRulesetForSubject(
  storeId: string,
  subjectKey: string,
) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { deployment: true },
  });
  if (!store) return null;

  const dep = store.deployment;
  let version = dep?.stableVersion ?? null;
  let isCanary = false;

  // Deterministic: the same subject always lands in the same cohort for a given
  // store and percentage, so a customer never flips ruleset between page loads.
  if (
    dep?.canaryVersion != null &&
    dep.canaryPercent > 0 &&
    isInCanary(storeId, subjectKey, dep.canaryPercent)
  ) {
    version = dep.canaryVersion;
    isCanary = true;
  }

  if (version == null) {
    return { store, ruleset: null, isCanary: false, version: null };
  }

  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId, version } },
    include: { rules: true },
  });

  return { store, ruleset, isCanary, version };
}

/** Load a specific version, bypassing canary assignment. Staff-only callers. */
export async function resolveRulesetByVersion(storeId: string, version: number) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { deployment: true },
  });
  if (!store) return null;

  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId, version } },
    include: { rules: true },
  });

  return { store, ruleset, isCanary: false, version };
}

type RuleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: DecisionType;
  priority: number;
  enabled: boolean;
  conditions: Prisma.JsonValue;
  actions: Prisma.JsonValue;
};

export function toRuleDefs(rules: RuleRow[]): RuleDefinition[] {
  return rules.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    category: r.category as EngineDecisionType,
    priority: r.priority,
    enabled: r.enabled,
    conditions: r.conditions as RuleDefinition["conditions"],
    actions: r.actions as RuleDefinition["actions"],
  }));
}

export interface DecisionOutcome {
  decision: Record<string, unknown>;
  rulesetVersion: number | null;
  matchedRules: string[];
  matchedRuleDetails: EvaluationResult["matchedRuleDetails"];
  explanation: EvaluationResult["explanation"];
  warnings: string[];
  traceId: string;
  isCanary: boolean;
  evaluationId?: string;
}

/** Pure evaluation against an already-resolved ruleset. Touches no storage. */
export function evaluateAgainst(
  resolved: ResolvedRuleset,
  decisionType: DecisionType,
  context: Record<string, unknown>,
): Omit<DecisionOutcome, "evaluationId"> {
  const killed = parseKillCategories(
    resolved.store.killSwitchCategories,
  ) as EngineDecisionType[];

  const result = evaluate({
    decisionType: decisionType as EngineDecisionType,
    context,
    rules: resolved.ruleset ? toRuleDefs(resolved.ruleset.rules) : [],
    killedCategories: killed,
    killAll: resolved.store.killSwitchEnabled,
  });

  return {
    decision: result.decision,
    rulesetVersion: resolved.version,
    matchedRules: result.matchedRules,
    matchedRuleDetails: result.matchedRuleDetails,
    explanation: result.explanation,
    warnings: result.warnings,
    traceId: result.traceId,
    isCanary: resolved.isCanary,
  };
}

function evaluationRow(
  resolved: ResolvedRuleset,
  storeId: string,
  subjectKey: string,
  decisionType: DecisionType,
  context: Record<string, unknown>,
  outcome: Omit<DecisionOutcome, "evaluationId">,
) {
  return {
    storeId,
    rulesetId: resolved.ruleset?.id,
    rulesetVersion: outcome.rulesetVersion ?? undefined,
    decisionType,
    subjectKey,
    context: context as object,
    decision: outcome.decision as object,
    matchedRules: outcome.matchedRules,
    explanation: outcome.explanation as object,
    warnings: outcome.warnings,
    isCanary: outcome.isCanary,
  };
}

export async function runDecision(input: {
  storeId: string;
  decisionType: DecisionType;
  context: Record<string, unknown>;
  subjectKey: string;
  persist?: boolean;
  /** Evaluate a specific version instead of the live one. Staff-only. */
  rulesetVersion?: number | null;
}): Promise<DecisionOutcome> {
  const resolved =
    input.rulesetVersion != null
      ? await resolveRulesetByVersion(input.storeId, input.rulesetVersion)
      : await resolveRulesetForSubject(input.storeId, input.subjectKey);

  if (!resolved) throw new Error("Magazin inexistent");

  const outcome = evaluateAgainst(resolved, input.decisionType, input.context);

  if (input.persist === false) return outcome;

  const ev = await prisma.evaluation.create({
    data: evaluationRow(
      resolved,
      input.storeId,
      input.subjectKey,
      input.decisionType,
      input.context,
      outcome,
    ),
    select: { id: true },
  });

  return { ...outcome, evaluationId: ev.id };
}

/**
 * Evaluate several decisions for one subject against a single resolved ruleset,
 * persisting them in one round trip.
 *
 * This is what a catalog page uses: pricing and availability for every product
 * costs one deployment read plus one bulk insert, rather than two queries and
 * one insert per product.
 */
export async function runDecisionBatch<K extends string>(input: {
  storeId: string;
  subjectKey: string;
  items: {
    key: K;
    decisionType: DecisionType;
    context: Record<string, unknown>;
  }[];
  persist?: boolean;
}): Promise<{
  outcomes: Map<K, Omit<DecisionOutcome, "evaluationId">>;
  resolved: ResolvedRuleset;
}> {
  const resolved = await resolveRulesetForSubject(
    input.storeId,
    input.subjectKey,
  );
  if (!resolved) throw new Error("Magazin inexistent");

  const outcomes = new Map<K, Omit<DecisionOutcome, "evaluationId">>();
  const rows: ReturnType<typeof evaluationRow>[] = [];

  for (const item of input.items) {
    const outcome = evaluateAgainst(resolved, item.decisionType, item.context);
    outcomes.set(item.key, outcome);
    if (input.persist !== false) {
      rows.push(
        evaluationRow(
          resolved,
          input.storeId,
          input.subjectKey,
          item.decisionType,
          item.context,
          outcome,
        ),
      );
    }
  }

  if (rows.length > 0) {
    await prisma.evaluation.createMany({ data: rows });
  }

  return { outcomes, resolved };
}

/** Replay historical evaluations against a candidate rule list (app-side metrics). */
export function simulateRulesetMetrics(
  historical: {
    decisionType: DecisionType;
    context: Prisma.JsonValue;
  }[],
  rules: RuleDefinition[],
) {
  let matchedEvals = 0;
  let totalDiscount = 0;
  let discountCount = 0;
  let blocked = 0;
  const byRule: Record<string, number> = {};

  for (const h of historical) {
    const r = evaluate({
      decisionType: h.decisionType as EngineDecisionType,
      context: (h.context ?? {}) as Record<string, unknown>,
      rules,
    });
    if (r.matchedRules.length) matchedEvals++;
    for (const k of r.matchedRules) {
      byRule[k] = (byRule[k] ?? 0) + 1;
    }
    if (typeof r.decision.discountPercent === "number") {
      totalDiscount += r.decision.discountPercent;
      discountCount++;
    }
    if (r.decision.blocked) blocked++;
  }

  const n = historical.length || 1;
  return {
    sampleSize: historical.length,
    matchRate: matchedEvals / n,
    avgDiscountPercent: discountCount ? totalDiscount / discountCount : 0,
    blockRate: blocked / n,
    ruleHitCounts: byRule,
  };
}
