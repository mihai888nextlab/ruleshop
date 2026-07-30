import { describe, expect, it } from "vitest";
import { analyzeRuleset } from "./analysis";
import { computeRuleImpact, costliestImpacts } from "./impact";
import type { HistoricalEvaluation } from "./simulate";
import type { RuleDefinition } from "./types";

/**
 * Impact is the figure a reviewer trusts when deciding whether a rule earns its
 * place, so the tests pin down the cases where hit counts and real effect
 * disagree — a rule that always loses, and a rule that wins while changing
 * nothing.
 */

function rule(
  overrides: Partial<RuleDefinition> & { key: string },
): RuleDefinition {
  return {
    name: overrides.key,
    description: "",
    category: "pricing",
    priority: 100,
    enabled: true,
    conditions: { op: "eq", path: "customer.tier", value: "vip" },
    actions: [{ type: "discountPercent", value: 10 }],
    ...overrides,
  };
}

function pricingHistory(
  count: number,
  context: Record<string, unknown>,
): HistoricalEvaluation[] {
  return Array.from({ length: count }, () => ({
    decisionType: "pricing" as const,
    context,
  }));
}

const vipContext = {
  customer: { tier: "vip" },
  product: { basePrice: 100 },
};

describe("computeRuleImpact", () => {
  it("attributes revenue and discount cost to the rule that caused them", () => {
    const rules = [rule({ key: "vip-10" })];
    const impacts = computeRuleImpact(pricingHistory(10, vipContext), rules);

    expect(impacts).toHaveLength(1);
    const impact = impacts[0]!;
    expect(impact.matched).toBe(10);
    expect(impact.decisionsChanged).toBe(10);
    // Ten replayed units at 100 sold for 90 instead: the rule gives away 100.
    expect(impact.revenueDelta).toBe(-100);
    expect(impact.discountCostDelta).toBe(100);
    expect(impact.verdict).toBe("effective");
  });

  it("reports no effect for a rule that matches but always loses its conflict", () => {
    const rules = [
      rule({ key: "big", priority: 200, actions: [{ type: "discountPercent", value: 30 }] }),
      rule({ key: "small", priority: 50, actions: [{ type: "discountPercent", value: 5 }] }),
    ];

    const impacts = computeRuleImpact(pricingHistory(5, vipContext), rules);
    const small = impacts.find((i) => i.key === "small")!;

    // It matched every time, and removing it changes nothing at all.
    expect(small.matched).toBe(5);
    expect(small.decisionsChanged).toBe(0);
    expect(small.revenueDelta).toBe(0);
    expect(small.verdict).toBe("no-effect");

    const big = impacts.find((i) => i.key === "big")!;
    expect(big.verdict).toBe("effective");
    // Without the winner, the loser applies — so the winner is only worth the
    // difference between 30% and 5%, not the whole 30%.
    expect(big.revenueDelta).toBe(-125);
  });

  it("reports no effect for a rule that wins but writes what the decision already had", () => {
    const rules = [
      rule({ key: "keep-available", priority: 200, category: "availability", actions: [{ type: "setAvailability", available: true }] }),
    ];

    const history: HistoricalEvaluation[] = Array.from({ length: 4 }, () => ({
      decisionType: "availability",
      context: vipContext,
    }));

    // Nothing else writes availability, so this rule is the only reason the
    // decision carries it: removing it does change the decision.
    const impacts = computeRuleImpact(history, rules);
    expect(impacts[0]!.verdict).toBe("effective");

    // With a higher-priority rule already setting the same value, the second one
    // becomes genuinely redundant.
    const withDuplicate = computeRuleImpact(history, [
      ...rules,
      rule({
        key: "also-available",
        priority: 100,
        category: "availability",
        actions: [{ type: "setAvailability", available: true }],
      }),
    ]);
    expect(withDuplicate.find((i) => i.key === "also-available")!.verdict).toBe(
      "no-effect",
    );
  });

  it("marks unused rules without claiming they cost anything", () => {
    const rules = [rule({ key: "cluj-only", conditions: { op: "eq", path: "customer.city", value: "Cluj" } })];
    const impacts = computeRuleImpact(pricingHistory(6, vipContext), rules);

    expect(impacts[0]!.matched).toBe(0);
    expect(impacts[0]!.verdict).toBe("unused");
    expect(impacts[0]!.revenueDelta).toBe(0);
  });

  it("does not replay disabled rules, which cannot have an effect", () => {
    const rules = [rule({ key: "off", enabled: false })];
    const impacts = computeRuleImpact(pricingHistory(3, vipContext), rules);

    expect(impacts[0]!.verdict).toBe("disabled");
    expect(impacts[0]!.decisionsChanged).toBe(0);
  });

  it("says nothing when there is no history to measure against", () => {
    const impacts = computeRuleImpact([], [rule({ key: "vip-10" })]);
    expect(impacts[0]!.verdict).toBe("no-history");
  });

  it("ignores key order when comparing two decisions", () => {
    // Two rules writing different keys: removing the lower-priority one changes
    // the decision by exactly one key, and the comparison must not be confused
    // by the order the engine happened to write them in.
    const rules = [
      rule({ key: "discount", priority: 200 }),
      rule({
        key: "points",
        priority: 100,
        category: "pricing",
        actions: [{ type: "grantLoyalty", points: 5 }],
      }),
    ];

    const impacts = computeRuleImpact(pricingHistory(3, vipContext), rules);
    expect(impacts.find((i) => i.key === "points")!.decisionsChanged).toBe(3);
    expect(impacts.find((i) => i.key === "points")!.revenueDelta).toBe(0);
  });
});

describe("costliestImpacts", () => {
  it("ranks by discount cost and omits rules that cost nothing", () => {
    const rules = [
      rule({ key: "cheap", conditions: { op: "eq", path: "customer.tier", value: "vip" }, actions: [{ type: "discountPercent", value: 5 }], priority: 10 }),
      rule({ key: "expensive", conditions: { op: "eq", path: "customer.tier", value: "vip" }, actions: [{ type: "discountPercent", value: 40 }], priority: 20 }),
      rule({ key: "elsewhere", conditions: { op: "eq", path: "customer.city", value: "Iași" } }),
    ];

    const ranked = costliestImpacts(
      computeRuleImpact(pricingHistory(4, vipContext), rules),
    );

    expect(ranked.map((row) => row.key)).toEqual(["expensive"]);
  });
});

describe("analyzeRuleset with history", () => {
  it("adds a no-effect finding and keeps it out of the way of never-wins", () => {
    const rules = [
      rule({ key: "big", priority: 200, actions: [{ type: "discountPercent", value: 30 }] }),
      rule({ key: "small", priority: 50, actions: [{ type: "discountPercent", value: 5 }] }),
    ];

    const history = pricingHistory(5, vipContext);
    const evaluations = history.map(() => ({
      matchedRules: ["big", "small"],
    }));

    const analysis = analyzeRuleset({ rules, evaluations, history });

    expect(analysis.replaySampleSize).toBe(5);
    expect(analysis.impacts).toHaveLength(2);

    // "small" matches but never wins, so the precise finding is never-wins and
    // it must not also be reported as no-effect.
    expect(analysis.counts["never-wins"]).toBe(1);
    expect(analysis.counts["no-effect"]).toBe(0);
  });

  it("computes no impacts when no contexts are supplied", () => {
    const analysis = analyzeRuleset({
      rules: [rule({ key: "vip-10" })],
      evaluations: [{ matchedRules: ["vip-10"] }],
    });

    expect(analysis.impacts).toEqual([]);
    expect(analysis.replaySampleSize).toBe(0);
  });
});
