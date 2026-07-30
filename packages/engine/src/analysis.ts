import { actionConflictKey } from "./actions";
import { describeConditionWith } from "./describe";
import type { ContextSchema } from "./schema";
import {
  isComparisonCondition,
  isGroupCondition,
  type ComparisonCondition,
  type Condition,
  type DecisionType,
  type RuleDefinition,
} from "./types";

/**
 * Static and statistical analysis of a ruleset.
 *
 * This is the substance behind the AI features. Every finding here is derived
 * from the rules and the recorded evaluations by ordinary code — the language
 * model is only ever asked to explain findings, never to produce them. A model
 * asserting "this rule is redundant" is a guess; a subset check over condition
 * leaves is a fact.
 *
 * The structural checks are deliberately conservative. Deciding in general
 * whether one condition implies another is not tractable here, so each check
 * documents the shape it can reason about and stays silent otherwise. A missed
 * redundancy is a small loss; a false accusation that costs someone a working
 * rule is not.
 */

export interface RuleUsage {
  key: string;
  /** Evaluations where the rule's conditions held. */
  matched: number;
  /** Evaluations where it also won its action's conflict key. */
  won: number;
}

export type FindingSeverity = "info" | "warning";

export type RuleFinding = {
  key: string;
  severity: FindingSeverity;
  /** Stable identifier so the UI can group and the AI can be told what it is. */
  code:
    | "unused"
    | "never-wins"
    | "duplicate"
    | "shadowed"
    | "contradictory"
    | "unsatisfiable"
    | "disabled";
  message: string;
  /** The other rule involved, for findings about a pair. */
  relatedKey?: string;
  detail?: string;
};

/**
 * Flattens a condition tree into AND-ed comparison leaves.
 *
 * Returns null when the tree contains OR or NOT, because the subset reasoning
 * below is only valid for a plain conjunction. Returning null rather than
 * approximating is what keeps the structural findings trustworthy.
 */
export function flattenAndLeaves(
  condition: Condition,
): ComparisonCondition[] | null {
  if (isComparisonCondition(condition)) return [condition];

  if (isGroupCondition(condition) && condition.op === "and") {
    const leaves: ComparisonCondition[] = [];
    for (const child of condition.children) {
      const childLeaves = flattenAndLeaves(child);
      if (childLeaves === null) return null;
      leaves.push(...childLeaves);
    }
    return leaves;
  }

  // OR groups and negations are out of scope for subset comparison.
  return null;
}

function leafKey(leaf: ComparisonCondition): string {
  return `${leaf.path}|${leaf.op}|${JSON.stringify(leaf.value ?? null)}`;
}

function conflictKeys(rule: RuleDefinition): Set<string> {
  return new Set(rule.actions.map(actionConflictKey));
}

function sharesConflictKey(a: RuleDefinition, b: RuleDefinition): boolean {
  const keys = conflictKeys(b);
  for (const key of conflictKeys(a)) {
    if (keys.has(key)) return true;
  }
  return false;
}

/**
 * Conditions that can never all hold at once.
 *
 * Detects the cases that come up in practice: the same field required to equal
 * two different values, an equality contradicted by an inequality, and numeric
 * bounds that cross.
 */
function unsatisfiableReason(
  leaves: ComparisonCondition[],
): string | null {
  const equals = new Map<string, unknown>();
  const notEquals = new Map<string, Set<string>>();
  const lowerBounds = new Map<string, number>();
  const upperBounds = new Map<string, number>();

  for (const leaf of leaves) {
    if (leaf.op === "eq") {
      const serialized = JSON.stringify(leaf.value ?? null);
      if (equals.has(leaf.path)) {
        const existing = JSON.stringify(equals.get(leaf.path) ?? null);
        if (existing !== serialized) {
          return `"${leaf.path}" ar trebui să fie simultan ${existing} și ${serialized}`;
        }
      }
      equals.set(leaf.path, leaf.value);
    }

    if (leaf.op === "neq") {
      const bucket = notEquals.get(leaf.path) ?? new Set<string>();
      bucket.add(JSON.stringify(leaf.value ?? null));
      notEquals.set(leaf.path, bucket);
    }

    if (typeof leaf.value === "number") {
      if (leaf.op === "gt" || leaf.op === "gte") {
        const current = lowerBounds.get(leaf.path);
        if (current === undefined || leaf.value > current) {
          lowerBounds.set(leaf.path, leaf.value);
        }
      }
      if (leaf.op === "lt" || leaf.op === "lte") {
        const current = upperBounds.get(leaf.path);
        if (current === undefined || leaf.value < current) {
          upperBounds.set(leaf.path, leaf.value);
        }
      }
    }
  }

  for (const [path, value] of equals) {
    const forbidden = notEquals.get(path);
    if (forbidden?.has(JSON.stringify(value ?? null))) {
      return `"${path}" ar trebui să fie și să nu fie ${JSON.stringify(value ?? null)}`;
    }
  }

  for (const [path, lower] of lowerBounds) {
    const upper = upperBounds.get(path);
    if (upper !== undefined && lower >= upper) {
      return `"${path}" ar trebui să fie peste ${lower} și sub ${upper}`;
    }
  }

  return null;
}

/**
 * Structural findings: redundancy, shadowing, contradiction, dead conditions.
 *
 * Compared pairwise within a decision type, since rules of different types never
 * compete.
 */
export function findStructuralIssues(
  rules: RuleDefinition[],
  schema?: ContextSchema,
): RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      findings.push({
        key: rule.key,
        severity: "info",
        code: "disabled",
        message: "Regula este dezactivată și nu participă la nicio evaluare.",
      });
      continue;
    }

    const leaves = flattenAndLeaves(rule.conditions);
    if (leaves) {
      const reason = unsatisfiableReason(leaves);
      if (reason) {
        findings.push({
          key: rule.key,
          severity: "warning",
          code: "unsatisfiable",
          message: "Condițiile nu pot fi îndeplinite niciodată.",
          detail: reason,
        });
      }
    }
  }

  const byType = new Map<DecisionType, RuleDefinition[]>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const bucket = byType.get(rule.category);
    if (bucket) bucket.push(rule);
    else byType.set(rule.category, [rule]);
  }

  for (const group of byType.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;

        const aLeaves = flattenAndLeaves(a.conditions);
        const bLeaves = flattenAndLeaves(b.conditions);
        if (!aLeaves || !bLeaves) continue;

        const aKeys = new Set(aLeaves.map(leafKey));
        const bKeys = new Set(bLeaves.map(leafKey));
        const identical =
          aKeys.size === bKeys.size && [...aKeys].every((k) => bKeys.has(k));

        if (identical) {
          const sameEffect =
            JSON.stringify(a.actions) === JSON.stringify(b.actions);

          if (sameEffect) {
            // Same trigger, same effect: one of them is dead weight.
            const [keep, drop] =
              a.priority >= b.priority ? [a, b] : [b, a];
            findings.push({
              key: drop.key,
              relatedKey: keep.key,
              severity: "warning",
              code: "duplicate",
              message: `Identică cu "${keep.key}": aceleași condiții și aceleași acțiuni.`,
              detail: schema
                ? describeConditionWith(drop.conditions, schema)
                : undefined,
            });
          } else if (sharesConflictKey(a, b)) {
            // Same trigger, competing effects: which one applies is decided
            // purely by priority, which is easy to get wrong silently.
            const [winner, loser] =
              a.priority === b.priority
                ? [a, b]
                : a.priority > b.priority
                  ? [a, b]
                  : [b, a];
            findings.push({
              key: loser.key,
              relatedKey: winner.key,
              severity: "warning",
              code: "contradictory",
              message:
                a.priority === b.priority
                  ? `Aceleași condiții ca "${winner.key}", efecte diferite și prioritate egală — rezultatul este ambiguu.`
                  : `Aceleași condiții ca "${winner.key}", care are prioritate mai mare și câștigă mereu.`,
            });
          }
          continue;
        }

        // Subsumption: if one rule's conditions are a subset of the other's,
        // then whenever the more specific rule matches, the broader one does
        // too. If the broader one also has higher priority and writes the same
        // key, the specific rule can never take effect.
        const aSubsetOfB = [...aKeys].every((k) => bKeys.has(k));
        const bSubsetOfA = [...bKeys].every((k) => aKeys.has(k));

        if (aSubsetOfB && a.priority > b.priority && sharesConflictKey(a, b)) {
          findings.push({
            key: b.key,
            relatedKey: a.key,
            severity: "warning",
            code: "shadowed",
            message: `Nu poate avea niciodată efect: "${a.key}" este mai generală, are prioritate mai mare și scrie același rezultat.`,
          });
        } else if (
          bSubsetOfA &&
          b.priority > a.priority &&
          sharesConflictKey(a, b)
        ) {
          findings.push({
            key: a.key,
            relatedKey: b.key,
            severity: "warning",
            code: "shadowed",
            message: `Nu poate avea niciodată efect: "${b.key}" este mai generală, are prioritate mai mare și scrie același rezultat.`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Findings that need evidence from recorded evaluations.
 *
 * "Never wins" is the interesting one: a rule whose conditions keep matching but
 * which always loses its conflict looks healthy by hit count alone, while in
 * fact it has never once affected a customer.
 */
export function findUsageIssues(
  rules: RuleDefinition[],
  usage: Map<string, RuleUsage>,
  options: { minimumSample: number },
): RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const stats = usage.get(rule.key) ?? { key: rule.key, matched: 0, won: 0 };

    if (stats.matched === 0) {
      findings.push({
        key: rule.key,
        severity: "info",
        code: "unused",
        message: `Nicio potrivire în ultimele ${options.minimumSample} evaluări analizate.`,
      });
      continue;
    }

    if (stats.won === 0) {
      findings.push({
        key: rule.key,
        severity: "warning",
        code: "never-wins",
        message: `S-a potrivit de ${stats.matched} ori, dar a pierdut de fiecare dată conflictul de prioritate — nu a schimbat niciun rezultat.`,
      });
    }
  }

  return findings;
}

/**
 * Which rule actually owns each conflict key for a given evaluation.
 *
 * Recorded evaluations store the rules that matched, not the one that won, so
 * the winner is recomputed from the same priority ordering the engine uses.
 */
export function winnersFor(
  rules: RuleDefinition[],
  matchedKeys: string[],
): Set<string> {
  const matched = new Set(matchedKeys);
  const candidates = rules
    .filter((rule) => matched.has(rule.key))
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  const owned = new Map<string, string>();
  for (const rule of candidates) {
    for (const key of conflictKeys(rule)) {
      if (!owned.has(key)) owned.set(key, rule.key);
    }
  }

  return new Set(owned.values());
}

/** Aggregates hit and win counts across recorded evaluations. */
export function buildUsage(
  rules: RuleDefinition[],
  evaluations: { matchedRules: string[] }[],
): Map<string, RuleUsage> {
  const usage = new Map<string, RuleUsage>();
  for (const rule of rules) {
    usage.set(rule.key, { key: rule.key, matched: 0, won: 0 });
  }

  for (const evaluation of evaluations) {
    const winners = winnersFor(rules, evaluation.matchedRules);

    for (const key of evaluation.matchedRules) {
      const stats = usage.get(key);
      if (!stats) continue;
      stats.matched += 1;
      if (winners.has(key)) stats.won += 1;
    }
  }

  return usage;
}

export interface RulesetAnalysis {
  sampleSize: number;
  usage: RuleUsage[];
  findings: RuleFinding[];
  counts: Record<RuleFinding["code"], number>;
}

/** Full analysis: structure plus recorded behaviour. */
export function analyzeRuleset(input: {
  rules: RuleDefinition[];
  evaluations: { matchedRules: string[] }[];
  schema?: ContextSchema;
}): RulesetAnalysis {
  const usage = buildUsage(input.rules, input.evaluations);

  const findings = [
    ...findStructuralIssues(input.rules, input.schema),
    ...findUsageIssues(input.rules, usage, {
      minimumSample: input.evaluations.length,
    }),
  ];

  const counts = {
    unused: 0,
    "never-wins": 0,
    duplicate: 0,
    shadowed: 0,
    contradictory: 0,
    unsatisfiable: 0,
    disabled: 0,
  } satisfies Record<RuleFinding["code"], number>;

  for (const finding of findings) counts[finding.code] += 1;

  return {
    sampleSize: input.evaluations.length,
    usage: [...usage.values()],
    findings,
    counts,
  };
}
