import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { evalCondition } from "./conditions";
import { applyAction, actionConflictKey } from "./actions";
import { compare } from "./path";
import type { Action, RuleDefinition } from "./types";

function rule(
  partial: Partial<RuleDefinition> &
    Pick<RuleDefinition, "key" | "category" | "conditions" | "actions">,
): RuleDefinition {
  return {
    name: partial.name ?? partial.key,
    priority: partial.priority ?? 100,
    enabled: partial.enabled ?? true,
    ...partial,
  };
}

describe("condition operators (how rules match)", () => {
  const ctx = {
    customer: {
      tier: "vip",
      age: 30,
      tags: ["newsletter", "eu"],
      city: "Cluj",
      birthday: "1995-06-15",
    },
    cart: { itemCount: 2, subtotal: 150 },
    product: { category: "shoes", name: "Runner Pro" },
    custom: { attributes: { oras: "Iași" } },
  };

  it.each([
    ["eq", "customer.tier", "vip", true],
    ["eq", "customer.tier", "standard", false],
    ["neq", "customer.tier", "standard", true],
    ["gt", "customer.age", 25, true],
    ["gte", "customer.age", 30, true],
    ["lt", "cart.itemCount", 5, true],
    ["lte", "cart.subtotal", 150, true],
    ["in", "customer.tier", ["vip", "gold"], true],
    ["in", "customer.tier", ["standard"], false],
    ["contains", "customer.tags", "eu", true],
    ["contains", "product.name", "Runner", true],
    ["exists", "customer.city", undefined, true],
    ["exists", "customer.missing", undefined, false],
  ] as const)("%s on %s", (op, path, value, expected) => {
    const result = evalCondition(
      value === undefined
        ? { op, path }
        : { op, path, value },
      ctx,
    );
    expect(result.matched).toBe(expected);
  });

  it("compares ISO dates with ordering operators", () => {
    expect(
      evalCondition(
        { op: "lt", path: "customer.birthday", value: "2000-01-01" },
        ctx,
      ).matched,
    ).toBe(true);
    expect(
      evalCondition(
        { op: "gt", path: "customer.birthday", value: "2000-01-01" },
        ctx,
      ).matched,
    ).toBe(false);
  });

  it("reads nested custom attribute paths", () => {
    expect(
      evalCondition(
        { op: "eq", path: "custom.attributes.oras", value: "Iași" },
        ctx,
      ).matched,
    ).toBe(true);
  });

  it("AND requires every child; OR needs one; NOT inverts", () => {
    const andOk = evalCondition(
      {
        op: "and",
        children: [
          { op: "eq", path: "customer.tier", value: "vip" },
          { op: "gte", path: "cart.itemCount", value: 2 },
        ],
      },
      ctx,
    );
    expect(andOk.matched).toBe(true);

    const andFail = evalCondition(
      {
        op: "and",
        children: [
          { op: "eq", path: "customer.tier", value: "vip" },
          { op: "gte", path: "cart.itemCount", value: 9 },
        ],
      },
      ctx,
    );
    expect(andFail.matched).toBe(false);
    expect(andFail.reason).toMatch(/AND/);

    const orOk = evalCondition(
      {
        op: "or",
        children: [
          { op: "eq", path: "customer.tier", value: "standard" },
          { op: "eq", path: "product.category", value: "shoes" },
        ],
      },
      ctx,
    );
    expect(orOk.matched).toBe(true);

    const notOk = evalCondition(
      {
        op: "not",
        child: { op: "eq", path: "customer.tier", value: "standard" },
      },
      ctx,
    );
    expect(notOk.matched).toBe(true);
  });

  it("empty AND is true; empty OR is false", () => {
    expect(evalCondition({ op: "and", children: [] }, ctx).matched).toBe(true);
    expect(evalCondition({ op: "or", children: [] }, ctx).matched).toBe(false);
  });
});

describe("compare helpers", () => {
  it("eq coerces string/number loosely via String()", () => {
    expect(compare("eq", 10, "10")).toBe(true);
    expect(compare("eq", 10, 11)).toBe(false);
  });

  it("refuses ordering on mixed non-numeric / non-date values", () => {
    expect(compare("gt", "abc", "def")).toBe(false);
    expect(compare("gt", 5, "not-a-number")).toBe(false);
  });
});

describe("actions (how matched rules change the decision)", () => {
  it("applies pricing, shipping, fraud, availability, loyalty, theme", () => {
    const decision: Record<string, unknown> = {};
    const actions: Action[] = [
      { type: "discountPercent", value: 15 },
      { type: "setFixedPrice", value: 99 },
      { type: "setShipping", method: "express", cost: 25 },
      { type: "addShippingOption", method: "standard", cost: 10, label: "Standard" },
      { type: "addShippingOption", method: "express", cost: 25, label: "Express" },
      { type: "blockCheckout", reason: "fraud" },
      { type: "flagFraud", score: 0.9, reason: "velocity" },
      { type: "setAvailability", available: false, reason: "out of stock" },
      { type: "grantLoyalty", points: 40 },
      { type: "setTheme", themeId: "winter" },
      { type: "set", path: "meta.campaign", value: "spring" },
    ];

    for (const action of actions) applyAction(decision, action);

    expect(decision.discountPercent).toBe(15);
    expect(decision.fixedPrice).toBe(99);
    expect(decision.shipping).toEqual({ method: "express", cost: 25 });
    expect(decision.shippingOptions).toEqual([
      { method: "standard", cost: 10, label: "Standard" },
      { method: "express", cost: 25, label: "Express" },
    ]);
    expect(decision.blocked).toBe(true);
    expect(decision.blockReason).toBe("fraud");
    expect(decision.fraud).toEqual({ score: 0.9, reason: "velocity" });
    expect(decision.availability).toEqual({
      available: false,
      reason: "out of stock",
    });
    expect(decision.loyaltyPoints).toBe(40);
    expect(decision.themeId).toBe("winter");
    expect(decision.meta).toEqual({ campaign: "spring" });
  });

  it("conflict keys isolate independent effects", () => {
    expect(actionConflictKey({ type: "discountPercent", value: 10 })).toBe(
      "discountPercent",
    );
    expect(
      actionConflictKey({ type: "addShippingOption", method: "express", cost: 1 }),
    ).toBe("shippingOption:express");
    expect(
      actionConflictKey({ type: "set", path: "banner.text", value: "x" }),
    ).toBe("set:banner.text");
  });
});

describe("evaluate — end-to-end rule engine behaviour", () => {
  const vip: RuleDefinition = rule({
    key: "vip-discount",
    category: "pricing",
    priority: 200,
    conditions: { op: "eq", path: "customer.tier", value: "vip" },
    actions: [{ type: "discountPercent", value: 20 }],
  });

  const bulk: RuleDefinition = rule({
    key: "bulk-discount",
    category: "pricing",
    priority: 50,
    conditions: { op: "gte", path: "cart.itemCount", value: 3 },
    actions: [{ type: "discountPercent", value: 10 }],
  });

  const freeShip: RuleDefinition = rule({
    key: "free-ship-vip",
    category: "shipping",
    priority: 100,
    conditions: { op: "eq", path: "customer.tier", value: "vip" },
    actions: [{ type: "setShipping", method: "standard", cost: 0 }],
  });

  it("only evaluates rules for the requested decision type", () => {
    const pricing = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" }, cart: { itemCount: 1 } },
      rules: [vip, freeShip],
    });
    expect(pricing.matchedRules).toEqual(["vip-discount"]);
    expect(pricing.decision.discountPercent).toBe(20);
    expect(pricing.decision.shipping).toBeUndefined();

    const shipping = evaluate({
      decisionType: "shipping",
      context: { customer: { tier: "vip" } },
      rules: [vip, freeShip],
    });
    expect(shipping.matchedRules).toEqual(["free-ship-vip"]);
    expect(shipping.decision.shipping).toEqual({
      method: "standard",
      cost: 0,
    });
  });

  it("skips disabled rules (enabled: false)", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" } },
      rules: [{ ...vip, enabled: false }],
    });
    expect(result.matchedRules).toEqual([]);
    expect(result.decision.discountPercent).toBeUndefined();
  });

  it("highest priority wins when two rules write the same field", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" }, cart: { itemCount: 5 } },
      rules: [vip, bulk],
    });
    expect(result.decision.discountPercent).toBe(20);
    expect(result.matchedRules).toEqual(["vip-discount", "bulk-discount"]);
    expect(result.warnings.some((w) => w.includes("Conflict"))).toBe(true);
  });

  it("same priority: later rule in priority-sorted order wins with a warning", () => {
    const a = rule({
      key: "a-discount",
      category: "pricing",
      priority: 100,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "discountPercent", value: 5 }],
    });
    const b = rule({
      key: "b-discount",
      category: "pricing",
      priority: 100,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "discountPercent", value: 12 }],
    });
    // Sorted by priority desc, then key asc → a before b; equal prio lets b replace a.
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" } },
      rules: [b, a],
    });
    expect(result.decision.discountPercent).toBe(12);
    expect(result.warnings.some((w) => w.includes("Conflict egal"))).toBe(true);
  });

  it("non-conflicting actions from different rules both apply", () => {
    const discount = rule({
      key: "pct",
      category: "pricing",
      priority: 10,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "discountPercent", value: 10 }],
    });
    const banner = rule({
      key: "banner",
      category: "pricing",
      priority: 5,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "set", path: "banner", value: "VIP" }],
    });
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" } },
      rules: [discount, banner],
    });
    expect(result.decision.discountPercent).toBe(10);
    expect(result.decision.banner).toBe("VIP");
    expect(result.matchedRules).toEqual(["pct", "banner"]);
  });

  it("records unmatched rules in the explanation trace", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "standard" }, cart: { itemCount: 1 } },
      rules: [vip, bulk],
    });
    expect(result.matchedRules).toEqual([]);
    expect(result.explanation).toHaveLength(2);
    expect(result.explanation.every((step) => step.matched === false)).toBe(
      true,
    );
  });

  it("killAll short-circuits every rule", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" } },
      rules: [vip],
      killAll: true,
    });
    expect(result.matchedRules).toEqual([]);
    expect(result.decision).toEqual({});
    expect(result.warnings.some((w) => /Kill switch global/i.test(w))).toBe(
      true,
    );
  });

  it("killedRuleKeys skips a single rule but keeps siblings", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: { customer: { tier: "vip" }, cart: { itemCount: 5 } },
      rules: [vip, bulk],
      killedRuleKeys: ["vip-discount"],
    });
    expect(result.matchedRules).toEqual(["bulk-discount"]);
    expect(result.decision.discountPercent).toBe(10);
    expect(
      result.explanation.find((e) => e.ruleKey === "vip-discount")?.matched,
    ).toBe(false);
  });

  it("builds loyalty / theme / availability decisions", () => {
    const loyalty = evaluate({
      decisionType: "loyalty",
      context: { customer: { tier: "vip" } },
      rules: [
        rule({
          key: "vip-points",
          category: "loyalty",
          conditions: { op: "eq", path: "customer.tier", value: "vip" },
          actions: [{ type: "grantLoyalty", points: 50 }],
        }),
      ],
    });
    expect(loyalty.decision.loyaltyPoints).toBe(50);

    const theme = evaluate({
      decisionType: "theme",
      context: { customer: { tier: "vip" } },
      rules: [
        rule({
          key: "vip-theme",
          category: "theme",
          conditions: { op: "eq", path: "customer.tier", value: "vip" },
          actions: [{ type: "setTheme", themeId: "nord-vip" }],
        }),
      ],
    });
    expect(theme.decision.themeId).toBe("nord-vip");

    const availability = evaluate({
      decisionType: "availability",
      context: { product: { stock: 0 } },
      rules: [
        rule({
          key: "oos",
          category: "availability",
          conditions: { op: "lte", path: "product.stock", value: 0 },
          actions: [
            { type: "setAvailability", available: false, reason: "stoc zero" },
          ],
        }),
      ],
    });
    expect(availability.decision.availability).toEqual({
      available: false,
      reason: "stoc zero",
    });
  });

  it("always returns a traceId", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: {},
      rules: [],
    });
    expect(result.traceId).toMatch(/^eval-/);
  });
});
