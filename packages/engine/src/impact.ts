import { evaluate } from "./evaluate";
import { computeMetrics, type HistoricalEvaluation } from "./simulate";
import type { DecisionType, RuleDefinition } from "./types";

/**
 * What each rule is actually worth, measured by removing it.
 *
 * Hit counts flatter rules. A rule can match constantly and still change
 * nothing: it may lose every priority conflict, or win one and write the value
 * the decision already had. The only way to know what a rule contributes is to
 * replay the recorded traffic without it and compare the outcomes — which is
 * what this does, once per rule.
 *
 * Everything here is arithmetic over decisions the engine produced. No estimate
 * is asked of a language model, because "this rule probably costs you money" is
 * an opinion and "removing it raises replayed revenue by 4.812,40 RON" is not.
 *
 * Cost is O(rules × history) evaluations. Callers with long histories should cap
 * the window they pass in rather than hoping this is cheap.
 */

export interface RuleImpact {
  key: string;
  category: DecisionType;
  /** Evaluations where the rule's conditions held. */
  matched: number;
  /**
   * Evaluations whose final decision differs when the rule is removed. This is
   * the number that matters: it is the rule's effect on customers.
   */
  decisionsChanged: number;
  /**
   * Replayed revenue with the rule minus revenue without it. Negative means the
   * rule gives money away — which is often exactly the intent, so it is reported
   * rather than judged.
   */
  revenueDelta: number;
  /** Discount cost attributable to this rule. */
  discountCostDelta: number;
  /** Checkouts this rule is responsible for blocking. */
  blockedDelta: number;
  /** Loyalty points this rule is responsible for granting. */
  pointsDelta: number;
  /**
   * The application's reading of the numbers above.
   *
   * `no-history` — nothing recorded to measure against.
   * `disabled` — switched off, so it cannot have an effect.
   * `unused` — conditions never held.
   * `no-effect` — it matched, but removing it changes no decision.
   * `effective` — it changes at least one outcome.
   */
  verdict: "no-history" | "disabled" | "unused" | "no-effect" | "effective";
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * A stable string for one decision, used to tell two outcomes apart.
 *
 * Keys are sorted because the engine writes them in whatever order the winning
 * rules happen to apply, and an unsorted JSON string would report a difference
 * where the decision is identical. Array values keep their order, since for
 * shipping options the order is part of the decision.
 */
function fingerprint(decision: Record<string, unknown>): string {
  const keys = Object.keys(decision).sort();
  return JSON.stringify(keys.map((key) => [key, decision[key]]));
}

function replayFingerprints(
  history: HistoricalEvaluation[],
  rules: RuleDefinition[],
): string[] {
  return history.map((item) =>
    fingerprint(
      evaluate({
        decisionType: item.decisionType,
        context: item.context,
        rules,
      }).decision,
    ),
  );
}

/**
 * Measures every rule by leave-one-out replay.
 *
 * The baseline is the ruleset exactly as given; each rule is then removed in
 * turn. Disabled rules are reported without being replayed: they are already
 * absent from evaluation, so removing them provably changes nothing.
 */
export function computeRuleImpact(
  history: HistoricalEvaluation[],
  rules: RuleDefinition[],
): RuleImpact[] {
  const baseMetrics = computeMetrics(history, rules);
  const baseFingerprints = replayFingerprints(history, rules);

  return rules.map((rule) => {
    const matched = baseMetrics.ruleHits[rule.key] ?? 0;

    if (!rule.enabled || history.length === 0) {
      return {
        key: rule.key,
        category: rule.category,
        matched,
        decisionsChanged: 0,
        revenueDelta: 0,
        discountCostDelta: 0,
        blockedDelta: 0,
        pointsDelta: 0,
        verdict: !rule.enabled ? ("disabled" as const) : ("no-history" as const),
      };
    }

    const without = rules.filter((candidate) => candidate.key !== rule.key);
    const metrics = computeMetrics(history, without);
    const fingerprints = replayFingerprints(history, without);

    let decisionsChanged = 0;
    for (let i = 0; i < baseFingerprints.length; i++) {
      if (baseFingerprints[i] !== fingerprints[i]) decisionsChanged += 1;
    }

    return {
      key: rule.key,
      category: rule.category,
      matched,
      decisionsChanged,
      revenueDelta: round(baseMetrics.grossRevenue - metrics.grossRevenue),
      discountCostDelta: round(baseMetrics.discountCost - metrics.discountCost),
      blockedDelta: baseMetrics.blockedCount - metrics.blockedCount,
      pointsDelta: baseMetrics.pointsGranted - metrics.pointsGranted,
      verdict:
        matched === 0
          ? "unused"
          : decisionsChanged === 0
            ? "no-effect"
            : "effective",
    };
  });
}

/** Rules that cost the most discount per decision they actually change. */
export function costliestImpacts(impacts: RuleImpact[]): RuleImpact[] {
  return impacts
    .filter((impact) => impact.discountCostDelta > 0)
    .sort((a, b) => b.discountCostDelta - a.discountCostDelta);
}
