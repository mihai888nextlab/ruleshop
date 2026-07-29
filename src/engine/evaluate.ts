import { applyAction, actionConflictKey } from "./actions";
import { evalCondition } from "./conditions";
import type {
  EvaluationInput,
  EvaluationResult,
  ExplanationStep,
  MatchedRuleInfo,
} from "./types";

function makeTraceId(): string {
  return `eval-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Conflict strategy: highest priority wins per action conflict key.
 * Same priority → later rule wins, with a warning in the trace.
 */
export function evaluate(input: EvaluationInput): EvaluationResult {
  const traceId = makeTraceId();
  const warnings: string[] = [];
  const explanation: ExplanationStep[] = [];
  const matchedRules: string[] = [];
  const matchedRuleDetails: MatchedRuleInfo[] = [];
  const decision: Record<string, unknown> = {};

  if (input.killAll) {
    warnings.push("Kill switch global activ — nicio regulă evaluată");
    return {
      decision,
      matchedRules,
      matchedRuleDetails,
      explanation: [
        {
          ruleKey: "*",
          ruleName: "kill-switch",
          matched: false,
          reason: "Kill switch magazin activ",
        },
      ],
      warnings,
      traceId,
    };
  }

  const killed = new Set(input.killedCategories ?? []);

  const rules = [...input.rules]
    .filter((r) => r.enabled)
    .filter((r) => r.category === input.decisionType)
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  /** conflictKey -> { priority, ruleKey } */
  const winners = new Map<string, { priority: number; ruleKey: string }>();

  for (const rule of rules) {
    if (killed.has(rule.category)) {
      explanation.push({
        ruleKey: rule.key,
        ruleName: rule.name,
        matched: false,
        reason: `Categorie ${rule.category} dezactivată (kill switch)`,
      });
      continue;
    }

    const cond = evalCondition(rule.conditions, input.context);
    if (!cond.matched) {
      explanation.push({
        ruleKey: rule.key,
        ruleName: rule.name,
        matched: false,
        reason: cond.reason,
      });
      continue;
    }

    const applied = [];
    for (const action of rule.actions) {
      const key = actionConflictKey(action);
      const prev = winners.get(key);
      if (prev && prev.priority > rule.priority) {
        warnings.push(
          `Conflict pe "${key}": ${prev.ruleKey} (prio ${prev.priority}) păstrează faţă de ${rule.key} (prio ${rule.priority})`,
        );
        continue;
      }
      if (prev && prev.priority === rule.priority && prev.ruleKey !== rule.key) {
        warnings.push(
          `Conflict egal pe "${key}": ${rule.key} înlocuiește ${prev.ruleKey} (aceeași prioritate)`,
        );
      }
      winners.set(key, { priority: rule.priority, ruleKey: rule.key });
      applyAction(decision, action);
      applied.push(action);
    }

    matchedRules.push(rule.key);
    matchedRuleDetails.push({
      key: rule.key,
      name: rule.name,
      priority: rule.priority,
      actions: rule.actions,
    });
    explanation.push({
      ruleKey: rule.key,
      ruleName: rule.name,
      matched: true,
      reason: cond.reason,
      appliedActions: applied,
    });
  }

  return {
    decision,
    matchedRules,
    matchedRuleDetails,
    explanation,
    warnings,
    traceId,
  };
}
