"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildContextSchema,
  isGroupCondition,
  validateRule,
  type Action,
  type Condition,
  type DecisionType,
  type FieldDef,
} from "@ruleshop/engine";
import { Button } from "../ui/button";
import { ActionList, defaultActionFor } from "./action-list";
import { ConditionTree } from "./condition-tree";
import { classifyErrors, fieldsInScope } from "./schema-utils";

/**
 * Visual rule editor.
 *
 * The edited value is the engine's own AST, so what the blocks show is exactly
 * what gets stored and evaluated — no intermediate editor format to translate.
 *
 * Validation runs in the browser using the same `validateRule` the server calls,
 * which is possible because the engine is pure TypeScript with no database
 * access. That gives per-block feedback as you build. The server re-validates on
 * save regardless: this copy is for feedback, not for trust.
 */

const CATEGORIES: { value: DecisionType; label: string }[] = [
  { value: "pricing", label: "Preț și reduceri" },
  { value: "shipping", label: "Livrare" },
  { value: "fraud", label: "Antifraudă" },
  { value: "availability", label: "Disponibilitate" },
  { value: "loyalty", label: "Loialitate" },
  { value: "theme", label: "Temă" },
];

export interface RuleDraft {
  key: string;
  name: string;
  description: string;
  category: DecisionType;
  priority: number;
  enabled: boolean;
  conditions: Condition;
  actions: Action[];
}

/**
 * The editor always presents a group at the root so there is somewhere to drop
 * the first block. A bare condition is wrapped on load, and a single-child AND
 * is unwrapped on save — `AND[x]` and `x` are equivalent, so this keeps stored
 * rules tidy without changing meaning.
 */
function normaliseRoot(conditions: Condition | undefined): Condition {
  if (!conditions) return { op: "and", children: [] };
  if (isGroupCondition(conditions)) return conditions;
  return { op: "and", children: [conditions] };
}

function denormaliseRoot(conditions: Condition): Condition {
  if (
    isGroupCondition(conditions) &&
    conditions.op === "and" &&
    conditions.children.length === 1
  ) {
    return conditions.children[0]!;
  }
  return conditions;
}

export function RuleBuilder({
  customFields,
  initial,
  onSave,
  onCancel,
}: {
  /** Store-defined attributes; built-ins come from the engine. */
  customFields: FieldDef[];
  initial?: Partial<RuleDraft>;
  onSave: (rule: unknown) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(() => ({
    key: initial?.key ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "pricing",
    priority: initial?.priority ?? 100,
    enabled: initial?.enabled ?? true,
    conditions: normaliseRoot(initial?.conditions),
    actions:
      initial?.actions && initial.actions.length > 0
        ? initial.actions
        : [defaultActionFor(initial?.category ?? "pricing")],
  }));

  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [pending, startTransition] = useTransition();

  const schema = useMemo(
    () => buildContextSchema(customFields),
    [customFields],
  );

  const scopedFields = useMemo(
    () => fieldsInScope(schema, draft.category),
    [schema, draft.category],
  );

  // Same validator the server runs, so the feedback here matches the outcome.
  const validation = useMemo(
    () =>
      validateRule(
        {
          key: draft.key,
          name: draft.name,
          description: draft.description,
          category: draft.category,
          priority: draft.priority,
          enabled: draft.enabled,
          conditions: denormaliseRoot(draft.conditions),
          actions: draft.actions,
        },
        { schema },
      ),
    [draft, schema],
  );

  const classified = useMemo(
    () => classifyErrors(validation.errors),
    [validation.errors],
  );

  function patch(next: Partial<RuleDraft>) {
    setSaved(false);
    setDraft((current) => ({ ...current, ...next }));
  }

  function handleSave() {
    setSaveError("");
    startTransition(async () => {
      try {
        await onSave({
          key: draft.key,
          name: draft.name,
          description: draft.description,
          category: draft.category,
          priority: draft.priority,
          enabled: draft.enabled,
          conditions: denormaliseRoot(draft.conditions),
          actions: draft.actions,
        });
        setSaved(true);
      } catch (cause) {
        setSaveError(
          cause instanceof Error ? cause.message : "Salvarea a eșuat",
        );
      }
    });
  }

  function applyJson() {
    setJsonError("");
    try {
      const parsed = JSON.parse(jsonText) as Partial<RuleDraft>;
      patch({
        ...parsed,
        conditions: normaliseRoot(parsed.conditions),
        actions: parsed.actions ?? draft.actions,
      });
      setShowJson(false);
    } catch (cause) {
      setJsonError(cause instanceof Error ? cause.message : "JSON invalid");
    }
  }

  const storedShape = {
    key: draft.key,
    name: draft.name,
    description: draft.description,
    category: draft.category,
    priority: draft.priority,
    enabled: draft.enabled,
    conditions: denormaliseRoot(draft.conditions),
    actions: draft.actions,
  };

  const inputClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Cheie</span>
          <input
            className={inputClass}
            value={draft.key}
            onChange={(e) => patch({ key: e.target.value })}
            placeholder="vip-discount"
            pattern="[a-z0-9-]+"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Nume</span>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tip de decizie</span>
          <select
            className={inputClass}
            value={draft.category}
            onChange={(e) => {
              const category = e.target.value as DecisionType;
              // Actions are kept rather than reset: discarding an author's work
              // on a mis-click is worse than showing that they no longer fit.
              patch({ category });
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Prioritate</span>
          <input
            type="number"
            className={inputClass}
            value={draft.priority}
            onChange={(e) => patch({ priority: Number(e.target.value) })}
          />
          <span className="text-xs text-[var(--muted)]">
            Mai mare câștigă conflictele.
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Descriere</span>
          <input
            className={inputClass}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Activă
        </label>
      </div>

      {/* Dark canvas: the blocks are the focus, and saturated block colours read
          as deliberate tooling here rather than as decoration. */}
      <div className="flex flex-col gap-3 rounded-xl bg-[#0b0e14] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">
            DACĂ
          </span>
          <span className="text-xs text-white/40">
            condițiile evaluate pentru fiecare decizie
          </span>
        </div>

        <ConditionTree
          value={draft.conditions}
          onChange={(conditions) => patch({ conditions })}
          schema={schema}
          fieldsInScope={scopedFields}
          errorsByPath={classified.byPath}
        />

        <ActionList
          actions={draft.actions}
          decisionType={draft.category}
          onChange={(actions) => patch({ actions })}
          errors={classified.actionErrors}
        />
      </div>

      {classified.generalErrors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          {classified.generalErrors.map((error, i) => (
            <li key={i} className="text-sm text-amber-900">
              {error}
            </li>
          ))}
        </ul>
      )}

      {saveError && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={pending || !validation.ok}
          title={
            validation.ok
              ? undefined
              : "Corectează erorile semnalate înainte de salvare"
          }
        >
          {pending ? "Se salvează…" : "Salvează regula"}
        </Button>

        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Renunță
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setJsonText(JSON.stringify(storedShape, null, 2));
            setJsonError("");
            setShowJson((v) => !v);
          }}
        >
          {showJson ? "Ascunde JSON" : "Vezi JSON"}
        </Button>

        {validation.ok ? (
          <span className="text-sm text-emerald-700">Regulă validă</span>
        ) : (
          <span className="text-sm text-red-700">
            {validation.errors.length}{" "}
            {validation.errors.length === 1 ? "problemă" : "probleme"}
          </span>
        )}

        {saved && <span className="text-sm text-[var(--muted)]">Salvat.</span>}
      </div>

      {showJson && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--muted)]">
            Forma stocată și evaluată de motor. Poate fi editată direct — util
            pentru a aplica o propunere generată de modulul AI.
          </p>
          <textarea
            className="min-h-64 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-xs"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          {jsonError && <p className="text-sm text-red-700">{jsonError}</p>}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={applyJson}
          >
            Aplică JSON
          </Button>
        </div>
      )}
    </div>
  );
}
