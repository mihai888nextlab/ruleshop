import { describe, expect, it } from "vitest";
import { evaluate, validateRule } from "./index";
import type { RuleDefinition } from "./types";

const vipDiscount: RuleDefinition = {
  key: "vip-discount",
  name: "VIP 15%",
  category: "pricing",
  priority: 100,
  enabled: true,
  conditions: {
    op: "eq",
    path: "customer.tier",
    value: "vip",
  },
  actions: [{ type: "discountPercent", value: 15 }],
};

const bulkDiscount: RuleDefinition = {
  key: "bulk-discount",
  name: "Bulk 10%",
  category: "pricing",
  priority: 50,
  enabled: true,
  conditions: {
    op: "gte",
    path: "cart.itemCount",
    value: 3,
  },
  actions: [{ type: "discountPercent", value: 10 }],
};

describe("evaluate", () => {
  it("applies matching pricing rule", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" }, cart: { itemCount: 1 } },
      rules: [vipDiscount, bulkDiscount],
    });
    expect(result.decision.discountPercent).toBe(15);
    expect(result.matchedRules).toEqual(["vip-discount"]);
  });

  it("uses highest priority on conflict", () => {
    const low: RuleDefinition = {
      ...vipDiscount,
      key: "low",
      priority: 10,
      actions: [{ type: "discountPercent", value: 5 }],
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
    };
    const high: RuleDefinition = {
      ...vipDiscount,
      key: "high",
      priority: 200,
      actions: [{ type: "discountPercent", value: 20 }],
    };
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" } },
      rules: [low, high],
    });
    expect(result.decision.discountPercent).toBe(20);
    expect(result.warnings.some((w) => w.includes("Conflict"))).toBe(true);
  });

  it("supports AND / OR / NOT", () => {
    const rule: RuleDefinition = {
      key: "complex",
      name: "Complex",
      category: "fraud",
      priority: 100,
      enabled: true,
      conditions: {
        op: "and",
        children: [
          { op: "gt", path: "order.total", value: 1000 },
          {
            op: "not",
            child: { op: "eq", path: "customer.verified", value: true },
          },
        ],
      },
      actions: [{ type: "blockCheckout", reason: "comandă suspectă" }],
    };
    const blocked = evaluate({
      decisionType: "fraud",
      context: { order: { total: 1500 }, customer: { verified: false } },
      rules: [rule],
    });
    expect(blocked.decision.blocked).toBe(true);

    const allowed = evaluate({
      decisionType: "fraud",
      context: { order: { total: 1500 }, customer: { verified: true } },
      rules: [rule],
    });
    expect(allowed.decision.blocked).toBeUndefined();
  });

  it("respects kill switch categories", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" } },
      rules: [vipDiscount],
      killedCategories: ["pricing"],
    });
    expect(result.decision.discountPercent).toBeUndefined();
    expect(result.matchedRules).toHaveLength(0);
  });
});

describe("validateRule", () => {
  it("rejects arbitrary code-like payloads", () => {
    const bad = validateRule({
      key: "x",
      name: "x",
      category: "pricing",
      priority: 1,
      enabled: true,
      conditions: { op: "eq", path: "a", value: 1 },
      actions: [{ type: "eval", code: "process.exit(1)" }],
    });
    expect(bad.ok).toBe(false);
  });

  it("accepts valid rule", () => {
    expect(validateRule(vipDiscount).ok).toBe(true);
  });
});
