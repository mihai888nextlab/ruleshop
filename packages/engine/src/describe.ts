import { findField, operatorLabel, type ContextSchema } from "./schema";
import {
  isGroupCondition,
  isNotCondition,
  type Condition,
} from "./types";

/**
 * Renders a condition tree as a sentence.
 *
 * Lives in the engine rather than in a UI layer because several surfaces need
 * the same wording — rule lists, version diffs, and the natural-language
 * explanations the AI module produces. One implementation keeps them from
 * describing the same rule differently.
 *
 * With a schema, fields and operators get their human labels ("Segment client
 * este vip"); without one it falls back to raw paths, which is what a caller
 * with no store context can offer.
 */

export function formatConditionValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.map(formatConditionValue).join(", ");
  if (typeof value === "boolean") return value ? "da" : "nu";
  return String(value);
}

export function describeConditionWith(
  condition: Condition,
  schema?: ContextSchema,
): string {
  if (isGroupCondition(condition)) {
    const joiner = condition.op === "and" ? " și " : " sau ";
    if (condition.children.length === 0) {
      return condition.op === "and" ? "(grup gol)" : "(grup gol)";
    }
    const parts = condition.children.map((child) => {
      const text = describeConditionWith(child, schema);
      // Parenthesise nested groups so precedence stays readable when an AND
      // contains an OR.
      return isGroupCondition(child) ? `(${text})` : text;
    });
    return parts.join(joiner);
  }

  if (isNotCondition(condition)) {
    const inner = describeConditionWith(condition.child, schema);
    return `nu (${inner})`;
  }

  const field = schema ? findField(schema, condition.path) : undefined;
  const label = field?.label ?? condition.path;
  const op = field
    ? operatorLabel(field.type, condition.op)
    : condition.op;

  if (condition.op === "exists") return `${label} ${op}`;
  return `${label} ${op} ${formatConditionValue(condition.value)}`;
}

/** Short form for collapsed blocks and drag overlays. */
export function summariseCondition(
  condition: Condition,
  schema?: ContextSchema,
): string {
  if (isGroupCondition(condition)) {
    const word = condition.op === "and" ? "ȘI" : "SAU";
    return `grup ${word} (${condition.children.length})`;
  }
  if (isNotCondition(condition)) {
    return `NU (${summariseCondition(condition.child, schema)})`;
  }
  return describeConditionWith(condition, schema);
}
