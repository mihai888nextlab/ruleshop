import type { AttributeType, CustomerAttributeDef } from "@prisma/client";
import {
  buildContextSchema,
  collectReferencedPaths,
  customAttributePath,
  fieldValueError,
  type ContextSchema,
  type FieldDef,
} from "@ruleshop/engine";
import { prisma } from "./prisma";

/**
 * Assembles a store's rule vocabulary: the platform's built-in facts plus the
 * customer attributes this store's administrator defined.
 *
 * One catalogue serves three consumers — the editor palette, server-side rule
 * validation, and the profile form — so they cannot disagree about what a field
 * is or which operators apply to it.
 */

function parseOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export function toFieldDef(def: {
  key: string;
  label: string;
  description: string;
  type: AttributeType;
  options: unknown;
}): FieldDef {
  return {
    path: customAttributePath(def.key),
    label: def.label,
    type: def.type,
    options: def.type === "enum" ? parseOptions(def.options) : undefined,
    description: def.description || undefined,
    source: "custom",
  };
}

export async function loadStoreAttributes(
  storeId: string,
  options: { includeArchived?: boolean } = {},
): Promise<CustomerAttributeDef[]> {
  return prisma.customerAttributeDef.findMany({
    where: {
      storeId,
      ...(options.includeArchived ? {} : { archived: false }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Schema used for validating rules.
 *
 * Archived attributes are included: rules written before an attribute was
 * archived must keep validating, otherwise archiving one field would block
 * every unrelated edit to the ruleset. The editor palette uses
 * `loadEditorSchema` instead, which omits them.
 */
export async function loadContextSchema(
  storeId: string,
): Promise<ContextSchema> {
  const defs = await loadStoreAttributes(storeId, { includeArchived: true });
  return buildContextSchema(defs.map(toFieldDef));
}

/** Schema offered when authoring: active attributes only. */
export async function loadEditorSchema(
  storeId: string,
): Promise<ContextSchema> {
  const defs = await loadStoreAttributes(storeId);
  return buildContextSchema(defs.map(toFieldDef));
}

export interface ProfileValidationResult {
  ok: boolean;
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * Validates what a customer submitted against the store's definitions.
 *
 * Uses the engine's own type checker, so a value that lands in a profile is
 * always one the rule engine can legitimately compare against. Unknown keys are
 * dropped rather than rejected: a stale form should not block a save, and
 * silently storing unvalidated keys would let arbitrary data into the decision
 * context.
 */
export function validateProfileValues(
  defs: CustomerAttributeDef[],
  submitted: Record<string, unknown>,
): ProfileValidationResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const def of defs) {
    if (def.archived) continue;

    const raw = submitted[def.key];
    const empty = raw === undefined || raw === null || raw === "";

    if (empty) {
      if (def.required) {
        errors[def.key] = `"${def.label}" este obligatoriu`;
      }
      continue;
    }

    const field = toFieldDef(def);
    const problem = fieldValueError(field, raw);
    if (problem) {
      errors[def.key] = `"${def.label}" ${problem}`;
      continue;
    }

    values[def.key] = raw;
  }

  return { ok: Object.keys(errors).length === 0, values, errors };
}

/**
 * Coerces form-encoded input to the types the definitions declare.
 *
 * HTML forms submit everything as text, so a `number` attribute arrives as
 * "42" and a checkbox as "on". Coercion happens before validation and keeps the
 * validator strict: it only ever sees properly typed values or a failure.
 */
export function coerceProfileInput(
  defs: CustomerAttributeDef[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const def of defs) {
    const value = raw[def.key];
    if (value === undefined) continue;

    switch (def.type) {
      case "number": {
        if (typeof value === "number") {
          out[def.key] = value;
        } else if (typeof value === "string" && value.trim() !== "") {
          const n = Number(value);
          // Leave an unparseable value as-is so validation reports it rather
          // than turning it into NaN or silently dropping it.
          out[def.key] = Number.isNaN(n) ? value : n;
        }
        break;
      }
      case "boolean": {
        if (typeof value === "boolean") {
          out[def.key] = value;
        } else if (typeof value === "string") {
          out[def.key] = value === "on" || value === "true";
        }
        break;
      }
      default:
        out[def.key] = value;
    }
  }

  return out;
}

/**
 * Which rules across all non-archived rulesets read a given attribute.
 *
 * Deleting an attribute a rule depends on would leave that condition pointing
 * at a field that no longer exists, so deletion is refused and the caller is
 * told exactly which rules to fix first.
 */
export async function findRulesReferencingAttribute(
  storeId: string,
  key: string,
): Promise<{ rulesetVersion: number; ruleKey: string; ruleName: string }[]> {
  const path = customAttributePath(key);

  const rulesets = await prisma.ruleset.findMany({
    where: { storeId, status: { not: "archived" } },
    select: {
      version: true,
      rules: {
        select: { key: true, name: true, conditions: true },
      },
    },
  });

  const hits: { rulesetVersion: number; ruleKey: string; ruleName: string }[] =
    [];

  for (const ruleset of rulesets) {
    for (const rule of ruleset.rules) {
      const paths = collectReferencedPaths(
        rule.conditions as Parameters<typeof collectReferencedPaths>[0],
      );
      if (paths.has(path)) {
        hits.push({
          rulesetVersion: ruleset.version,
          ruleKey: rule.key,
          ruleName: rule.name,
        });
      }
    }
  }

  return hits;
}
