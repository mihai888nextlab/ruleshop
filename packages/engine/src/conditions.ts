import { compare, getByPath } from "./path";
import type { ComparisonOp, Condition } from "./types";

const COMPARISON_OPS = new Set<ComparisonOp>([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "exists",
]);

export function evalCondition(
  condition: Condition,
  context: Record<string, unknown>,
): { matched: boolean; reason: string } {
  if (condition.op === "and") {
    const reasons: string[] = [];
    for (const child of condition.children) {
      const r = evalCondition(child, context);
      if (!r.matched) {
        return { matched: false, reason: `AND eșuat: ${r.reason}` };
      }
      reasons.push(r.reason);
    }
    return {
      matched: true,
      reason: reasons.length ? reasons.join("; ") : "AND gol (adevărat)",
    };
  }

  if (condition.op === "or") {
    if (condition.children.length === 0) {
      return { matched: false, reason: "OR gol (fals)" };
    }
    const fails: string[] = [];
    for (const child of condition.children) {
      const r = evalCondition(child, context);
      if (r.matched) {
        return { matched: true, reason: `OR: ${r.reason}` };
      }
      fails.push(r.reason);
    }
    return { matched: false, reason: `OR eșuat: ${fails.join("; ")}` };
  }

  if (condition.op === "not") {
    const r = evalCondition(condition.child, context);
    return {
      matched: !r.matched,
      reason: r.matched ? `NOT: negat (${r.reason})` : `NOT: ${r.reason}`,
    };
  }

  if (!COMPARISON_OPS.has(condition.op as ComparisonOp)) {
    return { matched: false, reason: `Operator necunoscut: ${(condition as { op: string }).op}` };
  }

  const cmp = condition as {
    op: ComparisonOp;
    path: string;
    value?: unknown;
  };
  const left = getByPath(context, cmp.path);
  const ok = compare(cmp.op, left, cmp.value);
  return {
    matched: ok,
    reason: `${cmp.path} ${cmp.op} ${JSON.stringify(cmp.value)} → ${JSON.stringify(left)} (${ok ? "ok" : "nu"})`,
  };
}
