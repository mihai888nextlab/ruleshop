import { describeConditionWith } from "./describe";
import type { ContextSchema } from "./schema";
import type { Action, Condition, RuleDefinition } from "./types";

/**
 * Structural comparison of two rulesets.
 *
 * Version diffing is what makes publishing reviewable: an operator about to
 * promote a version needs to see precisely what changes, not two JSON blobs to
 * eyeball. So the comparison is per rule and per field, and it reports condition
 * changes in words as well as structure.
 */

export interface FieldChange {
  field: keyof RuleDefinition | "conditions" | "actions";
  label: string;
  before: unknown;
  after: unknown;
  /** Human rendering, when the raw value is a tree or a list. */
  beforeText?: string;
  afterText?: string;
}

export type RuleDiff =
  | { kind: "added"; key: string; after: RuleDefinition }
  | { kind: "removed"; key: string; before: RuleDefinition }
  | {
      kind: "changed";
      key: string;
      before: RuleDefinition;
      after: RuleDefinition;
      changes: FieldChange[];
    }
  | { kind: "unchanged"; key: string; rule: RuleDefinition };

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  /** True when nothing at all differs between the two versions. */
  identical: boolean;
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function describeActions(actions: Action[]): string {
  return actions
    .map((action) => {
      switch (action.type) {
        case "discountPercent":
          return `reducere ${action.value}%`;
        case "setFixedPrice":
          return `preț fix ${action.value}`;
        case "setShipping":
          return `livrare impusă ${action.method} (${action.cost})`;
        case "addShippingOption":
          return `opțiune livrare ${action.method} (${action.cost})`;
        case "blockCheckout":
          return `blochează: ${action.reason}`;
        case "flagFraud":
          // The reason is part of what the action does, and omitting it made two
          // genuinely different actions describe identically in a diff.
          return action.reason
            ? `risc ${action.score} (${action.reason})`
            : `risc ${action.score}`;
        case "setAvailability": {
          const verb = action.available
            ? "marchează disponibil"
            : "ascunde produsul";
          return action.reason ? `${verb} (${action.reason})` : verb;
        }
        case "grantLoyalty":
          return `${action.points} puncte`;
        case "setTheme":
          return `temă ${action.themeId}`;
        case "set":
          return `${action.path} = ${JSON.stringify(action.value)}`;
      }
    })
    .join("; ");
}

const SCALAR_FIELDS: {
  field: keyof RuleDefinition;
  label: string;
}[] = [
  { field: "name", label: "Nume" },
  { field: "description", label: "Descriere" },
  { field: "category", label: "Tip de decizie" },
  { field: "priority", label: "Prioritate" },
  { field: "enabled", label: "Activă" },
];

function compareRule(
  before: RuleDefinition,
  after: RuleDefinition,
  schema?: ContextSchema,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const { field, label } of SCALAR_FIELDS) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (stable(from) !== stable(to)) {
      changes.push({ field, label, before: from, after: to });
    }
  }

  if (stable(before.conditions) !== stable(after.conditions)) {
    changes.push({
      field: "conditions",
      label: "Condiții",
      before: before.conditions,
      after: after.conditions,
      beforeText: describeTree(before.conditions, schema),
      afterText: describeTree(after.conditions, schema),
    });
  }

  if (stable(before.actions) !== stable(after.actions)) {
    changes.push({
      field: "actions",
      label: "Acțiuni",
      before: before.actions,
      after: after.actions,
      beforeText: describeActions(before.actions),
      afterText: describeActions(after.actions),
    });
  }

  return changes;
}

function describeTree(conditions: Condition, schema?: ContextSchema): string {
  return describeConditionWith(conditions, schema);
}

/**
 * Compares two rule lists by key.
 *
 * Keys, not array positions: reordering a ruleset is not a change to any rule,
 * and an index-based comparison would report every rule after an insertion as
 * modified.
 */
export function diffRulesets(
  before: RuleDefinition[],
  after: RuleDefinition[],
  schema?: ContextSchema,
): RuleDiff[] {
  const beforeByKey = new Map(before.map((rule) => [rule.key, rule]));
  const afterByKey = new Map(after.map((rule) => [rule.key, rule]));

  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();

  return keys.map((key): RuleDiff => {
    const from = beforeByKey.get(key);
    const to = afterByKey.get(key);

    if (!from && to) return { kind: "added", key, after: to };
    if (from && !to) return { kind: "removed", key, before: from };
    if (!from || !to) {
      // Unreachable: the key came from one of the two maps.
      throw new Error(`Cheie inconsistentă în diff: ${key}`);
    }

    const changes = compareRule(from, to, schema);
    if (changes.length === 0) return { kind: "unchanged", key, rule: to };

    return { kind: "changed", key, before: from, after: to, changes };
  });
}

export function summarizeDiff(diffs: RuleDiff[]): DiffSummary {
  const summary: DiffSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    identical: false,
  };

  for (const diff of diffs) {
    summary[diff.kind] += 1;
  }

  summary.identical =
    summary.added === 0 && summary.removed === 0 && summary.changed === 0;

  return summary;
}

/**
 * Changes that alter what customers experience.
 *
 * A description edit is not one. Publishing is a customer-facing act, so the
 * review screen distinguishes rules whose behaviour moves from rules that were
 * merely relabelled.
 */
export function hasBehaviouralChange(diff: RuleDiff): boolean {
  if (diff.kind === "added" || diff.kind === "removed") return true;
  if (diff.kind === "unchanged") return false;

  return diff.changes.some((change) => change.field !== "description");
}
