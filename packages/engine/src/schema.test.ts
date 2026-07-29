import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { compare } from "./path";
import {
  buildContextSchema,
  customAttributePath,
  fieldsForDecisionType,
  operatorsForType,
  type FieldDef,
} from "./schema";
import type { Condition, RuleDefinition } from "./types";
import { collectReferencedPaths, validateRule, validateRuleset } from "./validate";

/**
 * The context schema exists so that a rule referencing a fact the wrong way is
 * rejected at authoring time instead of quietly never matching in production.
 * These tests pin that behaviour down.
 */

const customFields: FieldDef[] = [
  {
    path: customAttributePath("city"),
    label: "Oraș",
    type: "enum",
    options: ["Cluj", "Iași", "Timișoara"],
    source: "custom",
  },
  {
    path: customAttributePath("birthday"),
    label: "Zi de naștere",
    type: "date",
    source: "custom",
  },
  {
    path: customAttributePath("newsletter"),
    label: "Abonat newsletter",
    type: "boolean",
    source: "custom",
  },
  {
    path: customAttributePath("referrals"),
    label: "Recomandări",
    type: "number",
    source: "custom",
  },
];

const schema = buildContextSchema(customFields);

function rule(conditions: Condition, overrides: Partial<RuleDefinition> = {}) {
  return {
    key: "test-rule",
    name: "Test rule",
    category: "pricing",
    priority: 100,
    enabled: true,
    conditions,
    actions: [{ type: "discountPercent", value: 10 }],
    ...overrides,
  };
}

describe("operator compatibility by data type", () => {
  it("rejects an ordering operator on a text field", () => {
    const result = validateRule(
      rule({ op: "gt", path: "customer.email", value: "a" }),
      { schema },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/operatorul "gt" nu se poate aplica/);
    expect(result.errors.join(" ")).toMatch(/customer\.email/);
  });

  it("rejects ordering on an enum field but allows membership", () => {
    expect(
      validateRule(rule({ op: "gte", path: "customer.tier", value: "vip" }), {
        schema,
      }).ok,
    ).toBe(false);

    expect(
      validateRule(
        rule({ op: "in", path: "customer.tier", value: ["vip", "standard"] }),
        { schema },
      ).ok,
    ).toBe(true);
  });

  it("rejects substring matching on a number field", () => {
    const result = validateRule(
      rule({ op: "contains", path: "cart.subtotal", value: "5" }),
      { schema },
    );
    expect(result.ok).toBe(false);
  });

  it("allows exists on every type", () => {
    for (const path of [
      "customer.email",
      "cart.subtotal",
      "customer.isGuest",
      "customer.tier",
      customAttributePath("birthday"),
    ]) {
      expect(
        validateRule(rule({ op: "exists", path }), { schema }).ok,
        `exists should be valid on ${path}`,
      ).toBe(true);
    }
  });

  it("offers only type-appropriate operators", () => {
    expect(operatorsForType("boolean")).toEqual(["eq", "neq", "exists"]);
    expect(operatorsForType("number")).toContain("gte");
    expect(operatorsForType("string")).not.toContain("gt");
  });
});

describe("value type checking", () => {
  it("rejects a string where a number is expected", () => {
    const result = validateRule(
      rule({ op: "gt", path: "cart.subtotal", value: "500" }),
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/așteaptă un număr/);
  });

  it("rejects an enum value outside the declared options", () => {
    const result = validateRule(
      rule({ op: "eq", path: customAttributePath("city"), value: "Brașov" }),
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/nu este în lista permisă/);
  });

  it("accepts a declared enum option", () => {
    expect(
      validateRule(
        rule({ op: "eq", path: customAttributePath("city"), value: "Cluj" }),
        { schema },
      ).ok,
    ).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(
      validateRule(
        rule({
          op: "lt",
          path: customAttributePath("birthday"),
          value: "01-01-1990",
        }),
        { schema },
      ).ok,
    ).toBe(false);

    expect(
      validateRule(
        rule({
          op: "lt",
          path: customAttributePath("birthday"),
          value: "1990-01-01",
        }),
        { schema },
      ).ok,
    ).toBe(true);
  });

  it("rejects a non-boolean for a yes/no field", () => {
    const result = validateRule(
      rule({
        op: "eq",
        path: customAttributePath("newsletter"),
        value: "true",
      }),
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/adevărat sau fals/);
  });

  it("type checks every element of an in list", () => {
    const result = validateRule(
      rule({
        op: "in",
        path: customAttributePath("referrals"),
        value: [1, 2, "three"],
      }),
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/elementul 3/);
  });

  it("rejects an empty in list", () => {
    const result = validateRule(
      rule({ op: "in", path: "customer.tier", value: [] }),
      { schema },
    );
    expect(result.ok).toBe(false);
  });
});

describe("unknown and out-of-scope fields", () => {
  it("rejects a path that is not in the schema", () => {
    const result = validateRule(
      rule({ op: "eq", path: "customer.attributes.nonexistent", value: "x" }),
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/nu există în schema magazinului/);
  });

  it("rejects a product field in a fraud rule, where no product is in scope", () => {
    const result = validateRule(
      rule({ op: "eq", path: "product.category", value: "shoes" }, {
        category: "fraud",
        actions: [{ type: "blockCheckout", reason: "test" }],
      }),
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/nu este disponibil pentru decizii/);
  });

  it("allows the same field in a pricing rule", () => {
    expect(
      validateRule(rule({ op: "eq", path: "product.category", value: "shoes" }), {
        schema,
      }).ok,
    ).toBe(true);
  });

  it("scopes the palette per decision type", () => {
    const fraudPaths = fieldsForDecisionType(schema, "fraud").map((f) => f.path);
    expect(fraudPaths).not.toContain("product.category");
    expect(fraudPaths).toContain("order.total");
    // Custom attributes carry no scope restriction, so they are always offered.
    expect(fraudPaths).toContain(customAttributePath("city"));
  });
});

describe("structural guards", () => {
  it("rejects an empty AND group, which would match everything", () => {
    const result = validateRule(rule({ op: "and", children: [] }), { schema });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/nu conține nicio condiție/);
  });

  it("rejects an empty OR group nested inside a valid AND", () => {
    const result = validateRule(
      rule({
        op: "and",
        children: [
          { op: "eq", path: "customer.tier", value: "vip" },
          { op: "or", children: [] },
        ],
      }),
      { schema },
    );
    expect(result.ok).toBe(false);
  });

  it("validates inside NOT groups", () => {
    const result = validateRule(
      rule({
        op: "not",
        child: { op: "gt", path: "customer.email", value: "x" },
      }),
      { schema },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects condition trees nested past the depth limit", () => {
    let deep: Condition = { op: "eq", path: "customer.tier", value: "vip" };
    for (let i = 0; i < 25; i++) {
      deep = { op: "not", child: deep };
    }
    const result = validateRule(rule(deep), { schema });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/adâncimea maximă/);
  });

  it("still validates structure when no schema is supplied", () => {
    // Type checking needs a store's schema; structural rules do not.
    expect(
      validateRule(rule({ op: "gt", path: "customer.email", value: "a" })).ok,
    ).toBe(true);
    expect(validateRule(rule({ op: "and", children: [] })).ok).toBe(false);
  });
});

describe("ruleset validation", () => {
  it("reports duplicate keys and labels errors by rule key", () => {
    const result = validateRuleset(
      [
        rule({ op: "eq", path: "customer.tier", value: "vip" }),
        rule({ op: "eq", path: "customer.tier", value: "standard" }),
      ],
      { schema },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/cheie duplicată/);
    expect(result.errors.join(" ")).toMatch(/"test-rule"/);
  });

  it("accepts a valid multi-rule set", () => {
    const result = validateRuleset(
      [
        rule({ op: "eq", path: "customer.tier", value: "vip" }),
        rule({ op: "gt", path: "cart.subtotal", value: 500 }, {
          key: "big-basket",
        }),
      ],
      { schema },
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("date comparison", () => {
  it("orders ISO dates instead of failing numeric coercion", () => {
    expect(compare("gt", "2026-01-01", "2025-01-01")).toBe(true);
    expect(compare("lt", "1990-05-20", "2000-01-01")).toBe(true);
    expect(compare("gte", "2025-01-01", "2025-01-01")).toBe(true);
  });

  it("does not reinterpret plain numbers as dates", () => {
    expect(compare("gt", 500, 100)).toBe(true);
    expect(compare("gt", "500", "100")).toBe(true);
  });

  it("is false for uncomparable operands rather than guessing", () => {
    expect(compare("gt", "not-a-date", "2020-01-01")).toBe(false);
    expect(compare("lt", undefined, 5)).toBe(false);
  });

  it("drives a date rule end to end through the engine", () => {
    const result = evaluate({
      decisionType: "pricing",
      context: {
        customer: { attributes: { birthday: "1990-07-30" } },
      },
      rules: [
        {
          key: "born-before-2000",
          name: "Born before 2000",
          category: "pricing",
          priority: 100,
          enabled: true,
          conditions: {
            op: "lt",
            path: customAttributePath("birthday"),
            value: "2000-01-01",
          },
          actions: [{ type: "discountPercent", value: 12 }],
        },
      ],
    });

    expect(result.matchedRules).toEqual(["born-before-2000"]);
    expect(result.decision.discountPercent).toBe(12);
  });
});

describe("collectReferencedPaths", () => {
  it("finds every path across nested groups", () => {
    const paths = collectReferencedPaths({
      op: "and",
      children: [
        { op: "eq", path: "customer.tier", value: "vip" },
        {
          op: "or",
          children: [
            { op: "gt", path: "cart.subtotal", value: 100 },
            { op: "not", child: { op: "exists", path: "customer.email" } },
          ],
        },
      ],
    });

    expect([...paths].sort()).toEqual([
      "cart.subtotal",
      "customer.email",
      "customer.tier",
    ]);
  });
});
