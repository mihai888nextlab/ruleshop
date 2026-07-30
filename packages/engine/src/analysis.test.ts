import { describe, expect, it } from "vitest";
import {
  analyzeRuleset,
  buildUsage,
  findStructuralIssues,
  findUsageIssues,
  flattenAndLeaves,
  winnersFor,
} from "./analysis";
import { computeMetrics, simulateChange } from "./simulate";
import type { Condition, RuleDefinition } from "./types";

/**
 * These findings are what the AI module reports, so they have to be right for
 * the right reasons. A false "this rule is redundant" could cost someone a
 * working rule, which is why the structural checks are conservative and tested
 * for silence as much as for detection.
 */

function rule(overrides: Partial<RuleDefinition> & { key: string }): RuleDefinition {
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

const and = (...children: Condition[]): Condition => ({ op: "and", children });
const eq = (path: string, value: unknown): Condition => ({ op: "eq", path, value });
const gt = (path: string, value: number): Condition => ({ op: "gt", path, value });
const lt = (path: string, value: number): Condition => ({ op: "lt", path, value });

describe("flattenAndLeaves", () => {
  it("flattens nested conjunctions", () => {
    const leaves = flattenAndLeaves(
      and(eq("a", 1), and(eq("b", 2), eq("c", 3))),
    );
    expect(leaves?.map((l) => l.path)).toEqual(["a", "b", "c"]);
  });

  it("refuses trees containing OR or NOT", () => {
    // Subset reasoning is only valid for a conjunction, so anything else is
    // reported as un-analysable rather than approximated.
    expect(flattenAndLeaves({ op: "or", children: [eq("a", 1)] })).toBeNull();
    expect(flattenAndLeaves({ op: "not", child: eq("a", 1) })).toBeNull();
    expect(flattenAndLeaves(and(eq("a", 1), { op: "not", child: eq("b", 2) }))).toBeNull();
  });
});

describe("unsatisfiable conditions", () => {
  it("detects a field required to equal two values", () => {
    const findings = findStructuralIssues([
      rule({ key: "impossible", conditions: and(eq("customer.tier", "vip"), eq("customer.tier", "standard")) }),
    ]);
    const finding = findings.find((f) => f.code === "unsatisfiable");
    expect(finding).toBeDefined();
    expect(finding!.detail).toMatch(/simultan/);
  });

  it("detects crossing numeric bounds", () => {
    const findings = findStructuralIssues([
      rule({ key: "impossible", conditions: and(gt("cart.subtotal", 500), lt("cart.subtotal", 100)) }),
    ]);
    expect(findings.some((f) => f.code === "unsatisfiable")).toBe(true);
  });

  it("detects eq contradicted by neq", () => {
    const findings = findStructuralIssues([
      rule({
        key: "impossible",
        conditions: and(eq("customer.tier", "vip"), {
          op: "neq",
          path: "customer.tier",
          value: "vip",
        }),
      }),
    ]);
    expect(findings.some((f) => f.code === "unsatisfiable")).toBe(true);
  });

  it("stays silent on satisfiable bounds", () => {
    const findings = findStructuralIssues([
      rule({ key: "fine", conditions: and(gt("cart.subtotal", 100), lt("cart.subtotal", 500)) }),
    ]);
    expect(findings.filter((f) => f.code === "unsatisfiable")).toEqual([]);
  });
});

describe("duplicates and contradictions", () => {
  it("flags identical conditions with identical actions", () => {
    const findings = findStructuralIssues([
      rule({ key: "a", priority: 200 }),
      rule({ key: "b", priority: 100 }),
    ]);
    const finding = findings.find((f) => f.code === "duplicate");
    expect(finding?.key).toBe("b");
    expect(finding?.relatedKey).toBe("a");
  });

  it("flags identical conditions with competing actions", () => {
    const findings = findStructuralIssues([
      rule({ key: "high", priority: 200, actions: [{ type: "discountPercent", value: 30 }] }),
      rule({ key: "low", priority: 100, actions: [{ type: "discountPercent", value: 10 }] }),
    ]);
    const finding = findings.find((f) => f.code === "contradictory");
    expect(finding?.key).toBe("low");
    expect(finding?.message).toMatch(/prioritate mai mare/);
  });

  it("calls out equal priority as ambiguous", () => {
    const findings = findStructuralIssues([
      rule({ key: "a", priority: 100, actions: [{ type: "discountPercent", value: 30 }] }),
      rule({ key: "b", priority: 100, actions: [{ type: "discountPercent", value: 10 }] }),
    ]);
    expect(
      findings.find((f) => f.code === "contradictory")?.message,
    ).toMatch(/ambigu/);
  });

  it("does not flag identical conditions writing different results", () => {
    // Same trigger but one sets a discount and the other grants points: both
    // apply, so neither is redundant.
    const findings = findStructuralIssues([
      rule({ key: "a", actions: [{ type: "discountPercent", value: 10 }] }),
      rule({
        key: "b",
        category: "loyalty",
        actions: [{ type: "grantLoyalty", points: 5 }],
      }),
    ]);
    expect(findings.filter((f) => f.code !== "disabled")).toEqual([]);
  });
});

describe("shadowing", () => {
  it("flags a specific rule that a broader higher-priority rule always beats", () => {
    const findings = findStructuralIssues([
      rule({ key: "broad", priority: 200, conditions: eq("customer.tier", "vip") }),
      rule({
        key: "specific",
        priority: 100,
        conditions: and(eq("customer.tier", "vip"), gt("cart.subtotal", 500)),
      }),
    ]);

    const finding = findings.find((f) => f.code === "shadowed");
    expect(finding?.key).toBe("specific");
    expect(finding?.relatedKey).toBe("broad");
  });

  it("does not flag when the specific rule has higher priority", () => {
    // This is the correct way to write an override, and must not be reported.
    const findings = findStructuralIssues([
      rule({ key: "broad", priority: 100, conditions: eq("customer.tier", "vip") }),
      rule({
        key: "specific",
        priority: 200,
        conditions: and(eq("customer.tier", "vip"), gt("cart.subtotal", 500)),
      }),
    ]);
    expect(findings.filter((f) => f.code === "shadowed")).toEqual([]);
  });

  it("does not flag when the rules write different results", () => {
    const findings = findStructuralIssues([
      rule({
        key: "broad",
        priority: 200,
        conditions: eq("customer.tier", "vip"),
        actions: [{ type: "setFixedPrice", value: 10 }],
      }),
      rule({
        key: "specific",
        priority: 100,
        conditions: and(eq("customer.tier", "vip"), gt("cart.subtotal", 500)),
        actions: [{ type: "discountPercent", value: 5 }],
      }),
    ]);
    expect(findings.filter((f) => f.code === "shadowed")).toEqual([]);
  });

  it("stays silent when a condition contains OR", () => {
    const findings = findStructuralIssues([
      rule({ key: "broad", priority: 200, conditions: eq("customer.tier", "vip") }),
      rule({
        key: "specific",
        priority: 100,
        conditions: {
          op: "or",
          children: [eq("customer.tier", "vip"), gt("cart.subtotal", 500)],
        },
      }),
    ]);
    expect(findings.filter((f) => f.code === "shadowed")).toEqual([]);
  });
});

describe("usage findings", () => {
  const rules = [
    rule({ key: "winner", priority: 200, actions: [{ type: "discountPercent", value: 30 }] }),
    rule({ key: "loser", priority: 100, actions: [{ type: "discountPercent", value: 10 }] }),
    rule({ key: "quiet", priority: 50, conditions: eq("customer.tier", "gold") }),
  ];

  it("recomputes which rule won each evaluation", () => {
    // Recorded evaluations store what matched, not what won, so the winner is
    // derived from the same priority ordering the engine uses.
    const winners = winnersFor(rules, ["winner", "loser"]);
    expect([...winners]).toEqual(["winner"]);
  });

  it("separates matching from winning", () => {
    const usage = buildUsage(rules, [
      { matchedRules: ["winner", "loser"] },
      { matchedRules: ["winner", "loser"] },
    ]);

    expect(usage.get("winner")).toEqual({ key: "winner", matched: 2, won: 2 });
    expect(usage.get("loser")).toEqual({ key: "loser", matched: 2, won: 0 });
    expect(usage.get("quiet")).toEqual({ key: "quiet", matched: 0, won: 0 });
  });

  it("reports a rule that matches but never takes effect", () => {
    const usage = buildUsage(rules, [
      { matchedRules: ["winner", "loser"] },
      { matchedRules: ["winner", "loser"] },
    ]);
    const findings = findUsageIssues(rules, usage, { minimumSample: 2 });

    const neverWins = findings.find((f) => f.code === "never-wins");
    expect(neverWins?.key).toBe("loser");
    expect(neverWins?.severity).toBe("warning");

    const unused = findings.find((f) => f.code === "unused");
    expect(unused?.key).toBe("quiet");
    // Never matching is worth knowing but is not itself a defect.
    expect(unused?.severity).toBe("info");
  });

  it("reports nothing for a rule that wins at least once", () => {
    const usage = buildUsage(rules, [{ matchedRules: ["loser"] }]);
    const findings = findUsageIssues(rules, usage, { minimumSample: 1 });
    expect(findings.some((f) => f.key === "loser")).toBe(false);
  });

  it("says nothing at all when no evaluations were recorded", () => {
    // A draft has never been evaluated, and calling all of its rules unused on
    // the strength of zero evidence would be an accusation, not a finding.
    const findings = findUsageIssues(rules, buildUsage(rules, []), {
      minimumSample: 0,
    });
    expect(findings).toEqual([]);
  });
});

describe("analyzeRuleset", () => {
  it("combines structural and usage findings with counts", () => {
    const analysis = analyzeRuleset({
      rules: [
        rule({ key: "a", priority: 200 }),
        rule({ key: "b", priority: 100 }),
        rule({ key: "off", enabled: false }),
      ],
      evaluations: [{ matchedRules: ["a"] }],
    });

    expect(analysis.sampleSize).toBe(1);
    expect(analysis.counts.duplicate).toBe(1);
    expect(analysis.counts.disabled).toBe(1);
    expect(analysis.counts.unused).toBeGreaterThan(0);
    expect(analysis.usage).toHaveLength(3);
  });
});

describe("business-impact simulation", () => {
  const history = [
    {
      decisionType: "pricing" as const,
      context: { customer: { tier: "vip" }, product: { basePrice: 100 } },
    },
    {
      decisionType: "pricing" as const,
      context: { customer: { tier: "standard" }, product: { basePrice: 100 } },
    },
  ];

  const current = [rule({ key: "vip", actions: [{ type: "discountPercent", value: 10 }] })];
  const candidate = [rule({ key: "vip", actions: [{ type: "discountPercent", value: 50 }] })];

  it("computes revenue and discount cost from replayed contexts", () => {
    const metrics = computeMetrics(history, current);
    // One VIP evaluation discounted to 90, one standard at full price.
    expect(metrics.grossRevenue).toBe(190);
    expect(metrics.discountCost).toBe(10);
    expect(metrics.matchedCount).toBe(1);
    expect(metrics.avgDiscountPercent).toBe(10);
  });

  it("reports the delta between current and candidate", () => {
    const result = simulateChange(history, current, candidate);

    expect(result.current.grossRevenue).toBe(190);
    expect(result.candidate.grossRevenue).toBe(150);

    const revenue = result.deltas.find((d) => d.format === "money")!;
    expect(revenue.delta).toBe(-40);
    expect(revenue.higherIsBetter).toBe(true);
  });

  it("honours fixed price over percentage, matching the storefront", () => {
    const metrics = computeMetrics(history, [
      rule({
        key: "vip",
        actions: [
          { type: "discountPercent", value: 90 },
          { type: "setFixedPrice", value: 25 },
        ],
      }),
    ]);
    // 25 for the VIP line plus 100 for the untouched standard line.
    expect(metrics.grossRevenue).toBe(125);
  });

  it("flags a sample too small to conclude from", () => {
    expect(simulateChange(history, current, candidate).sampleAdequacy).toBe(
      "insufficient",
    );

    const big = Array.from({ length: 250 }, () => history[0]!);
    expect(simulateChange(big, current, candidate).sampleAdequacy).toBe(
      "reasonable",
    );
  });

  it("lists which rules changed their hit counts", () => {
    const result = simulateChange(
      history,
      current,
      [
        ...candidate,
        rule({ key: "everyone", conditions: { op: "exists", path: "product.basePrice" } }),
      ],
    );
    expect(result.ruleHitChanges.map((r) => r.key)).toContain("everyone");
    expect(result.ruleHitChanges.find((r) => r.key === "everyone")).toEqual({
      key: "everyone",
      before: 0,
      after: 2,
    });
  });

  it("counts blocked orders for fraud rules", () => {
    const fraudHistory = [
      { decisionType: "fraud" as const, context: { order: { total: 5000 } } },
      { decisionType: "fraud" as const, context: { order: { total: 10 } } },
    ];
    const metrics = computeMetrics(fraudHistory, [
      rule({
        key: "big",
        category: "fraud",
        conditions: gt("order.total", 1000),
        actions: [{ type: "blockCheckout", reason: "prea mare" }],
      }),
    ]);

    expect(metrics.blockedCount).toBe(1);
    expect(metrics.blockRate).toBe(0.5);
  });
});
