import { describe, expect, it } from "vitest";
import {
  buildContextSchema,
  customAttributePath,
  validateRule,
  type Condition,
  type FieldDef,
} from "@ruleshop/engine";
import {
  appendChild,
  classifyErrors,
  coerceOperator,
  defaultValueFor,
  describeCondition,
  getAt,
  isPrefix,
  moveChild,
  moveInto,
  parseErrorPath,
  pathKey,
  removeAt,
  replaceAt,
} from "./schema-utils";

/**
 * The block editor's tree manipulation and error mapping.
 *
 * Both matter for correctness rather than polish: a bad tree edit silently
 * corrupts a rule, and a bad error mapping shows a problem on the wrong block,
 * which is worse than showing nothing.
 */

const customFields: FieldDef[] = [
  {
    path: customAttributePath("city"),
    label: "Oraș",
    type: "enum",
    options: ["Cluj", "Iași"],
    source: "custom",
  },
];

const schema = buildContextSchema(customFields);

const vip: Condition = { op: "eq", path: "customer.tier", value: "vip" };
const bigCart: Condition = { op: "gt", path: "cart.subtotal", value: 500 };
const inCluj: Condition = {
  op: "eq",
  path: customAttributePath("city"),
  value: "Cluj",
};

describe("error location mapping", () => {
  it("maps the root", () => {
    expect(parseErrorPath("conditions")).toEqual([]);
    expect(pathKey(parseErrorPath("conditions"))).toBe("root");
  });

  it("maps group children by index", () => {
    expect(parseErrorPath("conditions.and[0]")).toEqual([0]);
    expect(parseErrorPath("conditions.and[2]")).toEqual([2]);
    expect(parseErrorPath("conditions.and[1].or[3]")).toEqual([1, 3]);
  });

  it("treats a negation's child as index 0", () => {
    expect(parseErrorPath("conditions.not")).toEqual([0]);
    expect(parseErrorPath("conditions.and[2].not")).toEqual([2, 0]);
    expect(parseErrorPath("conditions.and[0].not.or[1]")).toEqual([0, 0, 1]);
  });

  it("routes errors to blocks, actions, or metadata", () => {
    const result = classifyErrors([
      "cheia este obligatorie",
      'conditions.and[1]: operatorul "gt" nu se poate aplica',
      "actions.0.value: prea mare",
    ]);

    expect(result.generalErrors).toEqual(["cheia este obligatorie"]);
    expect(result.actionErrors).toEqual(["actions.0.value: prea mare"]);
    expect(result.byPath.get("1")).toEqual([
      'operatorul "gt" nu se poate aplica',
    ]);
  });

  it("collects several errors on the same block", () => {
    const result = classifyErrors([
      "conditions.and[0]: prima",
      "conditions.and[0]: a doua",
    ]);
    expect(result.byPath.get("0")).toEqual(["prima", "a doua"]);
  });

  it("lands a real validation error on the block that caused it", () => {
    // A type error nested two levels down should be attributed to that block,
    // not to the root.
    const conditions: Condition = {
      op: "and",
      children: [
        vip,
        { op: "or", children: [bigCart, { op: "gt", path: "customer.email", value: "x" }] },
      ],
    };

    const result = validateRule(
      {
        key: "nested",
        name: "Nested",
        category: "pricing",
        priority: 100,
        enabled: true,
        conditions,
        actions: [{ type: "discountPercent", value: 5 }],
      },
      { schema },
    );

    expect(result.ok).toBe(false);
    const classified = classifyErrors(result.errors);
    // conditions.and[1].or[1] -> [1, 1]
    expect(classified.byPath.get("1-1")?.join(" ")).toMatch(/nu se poate aplica/);
    expect(classified.byPath.has("root")).toBe(false);
  });
});

describe("tree navigation", () => {
  const tree: Condition = {
    op: "and",
    children: [vip, { op: "or", children: [bigCart, { op: "not", child: inCluj }] }],
  };

  it("reads nodes by path", () => {
    expect(getAt(tree, [])).toBe(tree);
    expect(getAt(tree, [0])).toEqual(vip);
    expect(getAt(tree, [1, 0])).toEqual(bigCart);
    expect(getAt(tree, [1, 1, 0])).toEqual(inCluj);
  });

  it("returns undefined for paths off the tree", () => {
    expect(getAt(tree, [9])).toBeUndefined();
    expect(getAt(tree, [0, 0])).toBeUndefined();
  });

  it("detects ancestor paths", () => {
    expect(isPrefix([1], [1, 0])).toBe(true);
    expect(isPrefix([1], [1])).toBe(true);
    expect(isPrefix([1, 0], [1])).toBe(false);
    expect(isPrefix([0], [1, 0])).toBe(false);
  });
});

describe("tree mutation", () => {
  const tree: Condition = {
    op: "and",
    children: [vip, { op: "or", children: [bigCart, inCluj] }],
  };

  it("replaces without mutating the original", () => {
    const next = replaceAt(tree, [0], bigCart);
    expect(getAt(next, [0])).toEqual(bigCart);
    expect(getAt(tree, [0])).toEqual(vip);
  });

  it("removes a child", () => {
    const next = removeAt(tree, [0]);
    expect(getAt(next, [0])).toEqual({
      op: "or",
      children: [bigCart, inCluj],
    });
  });

  it("removes the whole NOT when its child is removed", () => {
    const withNot: Condition = {
      op: "and",
      children: [vip, { op: "not", child: bigCart }],
    };
    const next = removeAt(withNot, [1, 0]);
    expect(next).toEqual({ op: "and", children: [vip] });
  });

  it("appends only to groups", () => {
    expect(getAt(appendChild(tree, [], inCluj), [2])).toEqual(inCluj);
    // A comparison block is not a container, so this is a no-op.
    expect(appendChild(tree, [0], inCluj)).toBe(tree);
  });

  it("reorders within a group", () => {
    const next = moveChild(tree, [1], 0, 1);
    expect(getAt(next, [1, 0])).toEqual(inCluj);
    expect(getAt(next, [1, 1])).toEqual(bigCart);
  });

  it("ignores out-of-range reorders", () => {
    expect(moveChild(tree, [1], 0, 5)).toBe(tree);
    expect(moveChild(tree, [1], 0, -1)).toBe(tree);
  });

  it("moves a block into another group", () => {
    const next = moveInto(tree, [0], [1]);
    expect(getAt(next, [0])).toEqual({
      op: "or",
      children: [bigCart, inCluj, vip],
    });
  });

  it("refuses to move a group into its own descendant", () => {
    // Allowing this would detach the subtree from the tree entirely.
    expect(moveInto(tree, [1], [1])).toBe(tree);
    const nested: Condition = {
      op: "and",
      children: [{ op: "or", children: [{ op: "and", children: [vip] }] }],
    };
    expect(moveInto(nested, [0], [0, 0])).toBe(nested);
  });

  it("rebases the target path when removal shifts it", () => {
    // Moving child 0 into group 1 must land in the group that was at index 1,
    // even though removing child 0 shifts it down to index 0.
    const next = moveInto(tree, [0], [1]);
    const group = getAt(next, [0]);
    expect(group).toBeDefined();
    expect(group).toHaveProperty("op", "or");
    expect((group as { children: Condition[] }).children).toHaveLength(3);
  });
});

describe("type-driven defaults", () => {
  it("keeps a compatible operator and replaces an incompatible one", () => {
    expect(coerceOperator("number", "gt")).toBe("gt");
    expect(coerceOperator("string", "gt")).toBe("eq");
    expect(coerceOperator("boolean", "contains")).toBe("eq");
  });

  it("produces a value the field's type accepts", () => {
    const enumField = customFields[0]!;
    expect(defaultValueFor(enumField, "eq")).toBe("Cluj");
    expect(defaultValueFor(enumField, "in")).toEqual(["Cluj"]);
    expect(defaultValueFor(enumField, "exists")).toBeUndefined();

    const numberField: FieldDef = {
      path: "cart.subtotal",
      label: "Subtotal",
      type: "number",
      source: "builtin",
    };
    expect(defaultValueFor(numberField, "gt")).toBe(0);
    expect(defaultValueFor(numberField, "in")).toEqual([0]);
  });

  it("switching field then operator leaves the rule valid", () => {
    // This is the editor's core invariant: no sequence of field or operator
    // changes should leave a condition that fails validation.
    for (const field of schema.fields) {
      const op = coerceOperator(field.type, "eq");
      const value = defaultValueFor(field, op);
      const conditions: Condition =
        value === undefined
          ? { op, path: field.path }
          : { op, path: field.path, value };

      const result = validateRule(
        {
          key: "probe",
          name: "Probe",
          // Availability accepts product fields as well as customer ones.
          category: field.availableIn?.[0] ?? "pricing",
          priority: 100,
          enabled: true,
          conditions,
          actions: [{ type: "set", path: "x", value: 1 }],
        },
        { schema },
      );

      expect(result.errors, `default for ${field.path}`).toEqual([]);
    }
  });
});

describe("describeCondition", () => {
  it("uses field labels and type-appropriate operator wording", () => {
    expect(describeCondition(vip, schema)).toBe("Segment client este vip");
    expect(describeCondition(bigCart, schema)).toBe(
      "Subtotal coș mai mare decât 500",
    );
  });

  it("summarises groups and negations", () => {
    expect(describeCondition({ op: "and", children: [vip, bigCart] }, schema)).toBe(
      "grup ȘI (2)",
    );
    expect(describeCondition({ op: "not", child: vip }, schema)).toBe(
      "NU (Segment client este vip)",
    );
  });
});
