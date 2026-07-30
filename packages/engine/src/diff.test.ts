import { describe, expect, it } from "vitest";
import { diffRulesets, hasBehaviouralChange, summarizeDiff } from "./diff";
import { buildContextSchema, customAttributePath } from "./schema";
import type { FieldDef } from "./schema";
import type { RuleDefinition } from "./types";

const schema = buildContextSchema([
  {
    path: customAttributePath("city"),
    label: "Oraș",
    type: "enum",
    options: ["Cluj", "Iași"],
    source: "custom",
  } satisfies FieldDef,
]);

function rule(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    key: "vip-discount",
    name: "Reducere VIP",
    description: "",
    category: "pricing",
    priority: 100,
    enabled: true,
    conditions: { op: "eq", path: "customer.tier", value: "vip" },
    actions: [{ type: "discountPercent", value: 10 }],
    ...overrides,
  };
}

describe("diffRulesets", () => {
  it("reports an unchanged rule", () => {
    const diffs = diffRulesets([rule()], [rule()], schema);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.kind).toBe("unchanged");
    expect(summarizeDiff(diffs).identical).toBe(true);
  });

  it("reports additions and removals", () => {
    const diffs = diffRulesets(
      [rule()],
      [rule({ key: "other", name: "Alta" })],
      schema,
    );

    const kinds = diffs.map((d) => `${d.key}:${d.kind}`).sort();
    expect(kinds).toEqual(["other:added", "vip-discount:removed"]);

    const summary = summarizeDiff(diffs);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.identical).toBe(false);
  });

  it("isolates which fields changed", () => {
    const diffs = diffRulesets(
      [rule()],
      [rule({ priority: 250, actions: [{ type: "discountPercent", value: 25 }] })],
      schema,
    );

    const diff = diffs[0]!;
    expect(diff.kind).toBe("changed");
    if (diff.kind !== "changed") throw new Error("expected a change");

    const fields = diff.changes.map((c) => c.field).sort();
    expect(fields).toEqual(["actions", "priority"]);

    const priority = diff.changes.find((c) => c.field === "priority")!;
    expect(priority.before).toBe(100);
    expect(priority.after).toBe(250);
  });

  it("renders condition changes in words", () => {
    const diffs = diffRulesets(
      [rule()],
      [
        rule({
          conditions: {
            op: "and",
            children: [
              { op: "eq", path: "customer.tier", value: "vip" },
              { op: "gt", path: "cart.subtotal", value: 500 },
            ],
          },
        }),
      ],
      schema,
    );

    const diff = diffs[0]!;
    if (diff.kind !== "changed") throw new Error("expected a change");

    const change = diff.changes.find((c) => c.field === "conditions")!;
    expect(change.beforeText).toBe("Segment client este vip");
    expect(change.afterText).toBe(
      "Segment client este vip și Subtotal coș mai mare decât 500",
    );
  });

  it("renders action changes in words", () => {
    const diffs = diffRulesets(
      [rule()],
      [rule({ actions: [{ type: "blockCheckout", reason: "risc" }] })],
      schema,
    );
    const diff = diffs[0]!;
    if (diff.kind !== "changed") throw new Error("expected a change");

    const change = diff.changes.find((c) => c.field === "actions")!;
    expect(change.beforeText).toBe("reducere 10%");
    expect(change.afterText).toBe("blochează: risc");
  });

  it("compares by key, so reordering is not a change", () => {
    const a = rule({ key: "a" });
    const b = rule({ key: "b" });
    const diffs = diffRulesets([a, b], [b, a], schema);
    expect(diffs.every((d) => d.kind === "unchanged")).toBe(true);
  });

  it("uses custom attribute labels when describing conditions", () => {
    const diffs = diffRulesets(
      [rule()],
      [
        rule({
          conditions: {
            op: "eq",
            path: customAttributePath("city"),
            value: "Cluj",
          },
        }),
      ],
      schema,
    );
    const diff = diffs[0]!;
    if (diff.kind !== "changed") throw new Error("expected a change");
    expect(
      diff.changes.find((c) => c.field === "conditions")!.afterText,
    ).toBe("Oraș este Cluj");
  });

  it("describes negations and nested groups readably", () => {
    const diffs = diffRulesets(
      [rule()],
      [
        rule({
          conditions: {
            op: "and",
            children: [
              { op: "eq", path: "customer.tier", value: "vip" },
              {
                op: "not",
                child: { op: "eq", path: "customer.isFirstOrder", value: true },
              },
            ],
          },
        }),
      ],
      schema,
    );
    const diff = diffs[0]!;
    if (diff.kind !== "changed") throw new Error("expected a change");
    expect(diff.changes.find((c) => c.field === "conditions")!.afterText).toBe(
      "Segment client este vip și nu (Prima comandă este da)",
    );
  });
});

describe("hasBehaviouralChange", () => {
  it("treats a description edit as cosmetic", () => {
    const diffs = diffRulesets(
      [rule()],
      [rule({ description: "text nou" })],
      schema,
    );
    expect(diffs[0]!.kind).toBe("changed");
    expect(hasBehaviouralChange(diffs[0]!)).toBe(false);
  });

  it("treats a threshold edit as behavioural", () => {
    const diffs = diffRulesets(
      [rule()],
      [rule({ actions: [{ type: "discountPercent", value: 40 }] })],
      schema,
    );
    expect(hasBehaviouralChange(diffs[0]!)).toBe(true);
  });

  it("treats added and removed rules as behavioural", () => {
    const diffs = diffRulesets([rule()], [], schema);
    expect(hasBehaviouralChange(diffs[0]!)).toBe(true);
  });

  it("treats disabling a rule as behavioural", () => {
    const diffs = diffRulesets([rule()], [rule({ enabled: false })], schema);
    expect(hasBehaviouralChange(diffs[0]!)).toBe(true);
  });
});
