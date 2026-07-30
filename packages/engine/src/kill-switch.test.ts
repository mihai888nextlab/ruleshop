import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import type { RuleDefinition } from "./types";

/**
 * Kill switches: the operational escape hatch.
 *
 * A published version is immutable so it stays auditable and restorable, which
 * means "turn this off right now" cannot be done by editing a rule. These
 * switches take something out of service without touching the version.
 */

const rules: RuleDefinition[] = [
  {
    key: "vip-discount",
    name: "Reducere VIP",
    category: "pricing",
    priority: 200,
    enabled: true,
    conditions: { op: "eq", path: "customer.tier", value: "vip" },
    actions: [{ type: "discountPercent", value: 25 }],
  },
  {
    key: "category-shoes",
    name: "Reducere pantofi",
    category: "pricing",
    priority: 50,
    enabled: true,
    conditions: { op: "eq", path: "product.category", value: "shoes" },
    actions: [{ type: "discountPercent", value: 10 }],
  },
  {
    key: "loyalty-base",
    name: "Puncte de bază",
    category: "loyalty",
    priority: 10,
    enabled: true,
    conditions: { op: "exists", path: "customer.tier" },
    actions: [{ type: "grantLoyalty", points: 5 }],
  },
];

const context = {
  customer: { tier: "vip" },
  product: { category: "shoes" },
};

describe("per-rule kill switch", () => {
  it("without it, the highest-priority rule wins", () => {
    const result = evaluate({ decisionType: "pricing", context, rules });
    expect(result.decision.discountPercent).toBe(25);
    expect(result.matchedRules).toContain("vip-discount");
  });

  it("killing the winner lets the next rule take effect", () => {
    const result = evaluate({
      decisionType: "pricing",
      context,
      rules,
      killedRuleKeys: ["vip-discount"],
    });

    // The point of the switch: the decision continues without the killed rule
    // rather than collapsing to no decision at all.
    expect(result.decision.discountPercent).toBe(10);
    expect(result.matchedRules).toEqual(["category-shoes"]);
  });

  it("reports the kill in the trace and warnings", () => {
    const result = evaluate({
      decisionType: "pricing",
      context,
      rules,
      killedRuleKeys: ["vip-discount"],
    });

    const step = result.explanation.find((s) => s.ruleKey === "vip-discount");
    expect(step?.matched).toBe(false);
    expect(step?.reason).toMatch(/kill switch/i);
    expect(result.warnings.join(" ")).toMatch(/vip-discount/);
  });

  it("killing every rule of a type leaves an empty decision", () => {
    const result = evaluate({
      decisionType: "pricing",
      context,
      rules,
      killedRuleKeys: ["vip-discount", "category-shoes"],
    });
    expect(result.decision.discountPercent).toBeUndefined();
    expect(result.matchedRules).toEqual([]);
  });

  it("does not affect rules of other decision types", () => {
    const result = evaluate({
      decisionType: "loyalty",
      context,
      rules,
      killedRuleKeys: ["vip-discount", "category-shoes"],
    });
    expect(result.decision.loyaltyPoints).toBe(5);
  });

  it("ignores keys that do not exist", () => {
    const result = evaluate({
      decisionType: "pricing",
      context,
      rules,
      killedRuleKeys: ["no-such-rule"],
    });

    expect(result.decision.discountPercent).toBe(25);
    // The ordinary priority-conflict warning is still expected here; what must
    // not appear is a kill-switch warning for a key nothing matches.
    expect(result.warnings.some((w) => /kill switch/i.test(w))).toBe(false);
  });
});

describe("category kill switch", () => {
  it("disables a whole decision category", () => {
    const result = evaluate({
      decisionType: "pricing",
      context,
      rules,
      killedCategories: ["pricing"],
    });
    expect(result.decision.discountPercent).toBeUndefined();
    expect(result.explanation.every((s) => !s.matched)).toBe(true);
  });

  it("leaves other categories running", () => {
    const result = evaluate({
      decisionType: "loyalty",
      context,
      rules,
      killedCategories: ["pricing"],
    });
    expect(result.decision.loyaltyPoints).toBe(5);
  });
});

describe("global kill switch", () => {
  it("stops evaluation entirely and says so", () => {
    const result = evaluate({
      decisionType: "pricing",
      context,
      rules,
      killAll: true,
    });

    expect(result.decision).toEqual({});
    expect(result.matchedRules).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/kill switch/i);
    expect(result.traceId).toMatch(/^eval-/);
  });

  it("takes precedence over everything else", () => {
    const result = evaluate({
      decisionType: "loyalty",
      context,
      rules,
      killAll: true,
      killedRuleKeys: [],
      killedCategories: [],
    });
    expect(result.decision).toEqual({});
  });
});
