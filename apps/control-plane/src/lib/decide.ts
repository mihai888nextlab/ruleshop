import type { DecisionType, Prisma } from "@prisma/client";
import { evaluate } from "@ruleshop/engine";
import type { DecisionType as EngineDecisionType, RuleDefinition } from "@ruleshop/engine";
import { isInCanary } from "./canary";
import { prisma } from "./prisma";
import { parseKillCategories } from "./store";

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

function toRuleDefs(
  rules: {
    id: string;
    key: string;
    name: string;
    description: string;
    category: DecisionType;
    priority: number;
    enabled: boolean;
    conditions: Prisma.JsonValue;
    actions: Prisma.JsonValue;
  }[],
): RuleDefinition[] {
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

export async function runDecision(input: {
  storeId: string;
  decisionType: DecisionType;
  context: Record<string, unknown>;
  subjectKey: string;
  persist?: boolean;
  /** Override ruleset version (for test harness / simulation) */
  rulesetVersion?: number | null;
}) {
  const resolved = await resolveRulesetForSubject(input.storeId, input.subjectKey);
  if (!resolved) {
    throw new Error("Magazin inexistent");
  }

  let ruleset = resolved.ruleset;
  let isCanary = resolved.isCanary;
  let version = resolved.version;

  if (input.rulesetVersion != null) {
    ruleset = await prisma.ruleset.findUnique({
      where: {
        storeId_version: {
          storeId: input.storeId,
          version: input.rulesetVersion,
        },
      },
      include: { rules: true },
    });
    version = input.rulesetVersion;
    isCanary = false;
  }

  const killed = parseKillCategories(resolved.store.killSwitchCategories) as EngineDecisionType[];
  const result = evaluate({
    decisionType: input.decisionType as EngineDecisionType,
    context: input.context,
    rules: ruleset ? toRuleDefs(ruleset.rules) : [],
    killedCategories: killed,
    killAll: resolved.store.killSwitchEnabled,
  });

  let evaluationId: string | undefined;
  if (input.persist !== false) {
    const ev = await prisma.evaluation.create({
      data: {
        storeId: input.storeId,
        rulesetId: ruleset?.id,
        rulesetVersion: version ?? undefined,
        decisionType: input.decisionType,
        subjectKey: input.subjectKey,
        context: input.context as object,
        decision: result.decision as object,
        matchedRules: result.matchedRules,
        explanation: result.explanation as object,
        warnings: result.warnings,
        isCanary,
      },
    });
    evaluationId = ev.id;
  }

  return {
    decision: result.decision,
    rulesetVersion: version,
    matchedRules: result.matchedRules,
    matchedRuleDetails: result.matchedRuleDetails,
    explanation: result.explanation,
    warnings: result.warnings,
    traceId: result.traceId,
    isCanary,
    evaluationId,
  };
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
