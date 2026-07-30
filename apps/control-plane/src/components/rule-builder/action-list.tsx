"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Action, DecisionType } from "@ruleshop/engine";
import { DROP_THEN_ID } from "./condition-tree";

/**
 * Action bricks for the „Atunci” mouth of the Scratch C-block.
 */

type ActionType = Action["type"];

export interface ActionMeta {
  type: ActionType;
  label: string;
  scopes: DecisionType[];
  create: () => Action;
}

export const ACTIONS: ActionMeta[] = [
  {
    type: "discountPercent",
    label: "Reducere procentuală",
    scopes: ["pricing"],
    create: () => ({ type: "discountPercent", value: 10 }),
  },
  {
    type: "setFixedPrice",
    label: "Preț fix",
    scopes: ["pricing"],
    create: () => ({ type: "setFixedPrice", value: 0 }),
  },
  {
    type: "setShipping",
    label: "Metodă de livrare impusă",
    scopes: ["shipping"],
    create: () => ({ type: "setShipping", method: "standard", cost: 0 }),
  },
  {
    type: "addShippingOption",
    label: "Adaugă opțiune de livrare",
    scopes: ["shipping"],
    create: () => ({
      type: "addShippingOption",
      method: "express",
      cost: 25,
      label: "Express",
    }),
  },
  {
    type: "blockCheckout",
    label: "Blochează comanda",
    scopes: ["fraud"],
    create: () => ({ type: "blockCheckout", reason: "" }),
  },
  {
    type: "flagFraud",
    label: "Marchează risc",
    scopes: ["fraud"],
    create: () => ({ type: "flagFraud", score: 50, reason: "" }),
  },
  {
    type: "setAvailability",
    label: "Disponibilitate",
    scopes: ["availability"],
    create: () => ({ type: "setAvailability", available: false, reason: "" }),
  },
  {
    type: "grantLoyalty",
    label: "Acordă puncte",
    scopes: ["loyalty"],
    create: () => ({ type: "grantLoyalty", points: 10 }),
  },
  {
    type: "setTheme",
    label: "Temă vizuală",
    scopes: ["theme"],
    create: () => ({ type: "setTheme", themeId: "" }),
  },
  {
    type: "set",
    label: "Câmp personalizat",
    scopes: [
      "pricing",
      "shipping",
      "fraud",
      "availability",
      "loyalty",
      "theme",
    ],
    create: () => ({ type: "set", path: "", value: "" }),
  },
];

export function actionsForScope(decisionType: DecisionType): ActionMeta[] {
  return ACTIONS.filter((a) => a.scopes.includes(decisionType));
}

export function defaultActionFor(decisionType: DecisionType): Action {
  const available = actionsForScope(decisionType);
  const first = available[0];
  return first ? first.create() : { type: "set", path: "", value: "" };
}

export function ActionList({
  actions,
  decisionType,
  onChange,
  errors,
  themeKeys,
}: {
  actions: Action[];
  decisionType: DecisionType;
  onChange: (next: Action[]) => void;
  errors: string[];
  themeKeys: string[];
}) {
  const available = actionsForScope(decisionType);
  const { setNodeRef, isOver } = useDroppable({ id: DROP_THEN_ID });

  function update(index: number, next: Action) {
    onChange(actions.map((a, i) => (i === index ? next : a)));
  }

  return (
    <div
      ref={setNodeRef}
      data-over={isOver || undefined}
      className="rb-mouth rb-mouth--then"
    >
      {errors.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {errors.map((error, i) => (
            <li key={i} className="rb-block-error">
              {error}
            </li>
          ))}
        </ul>
      )}

      <div className="rb-action-stack">
        {actions.map((action, index) => (
          <div key={index} className="rb-block rb-block--action">
            <div className="rb-block-head">
              <span className="rb-action-index" aria-hidden>
                {index + 1}
              </span>
              <select
                aria-label="Tip acțiune"
                className="rb-reporter"
                value={action.type}
                onChange={(e) => {
                  const meta = ACTIONS.find((a) => a.type === e.target.value);
                  if (meta) update(index, meta.create());
                }}
              >
                {available.map((meta) => (
                  <option key={meta.type} value={meta.type}>
                    {meta.label}
                  </option>
                ))}
                {!available.some((m) => m.type === action.type) && (
                  <option value={action.type}>
                    {action.type} (nepotrivit pentru {decisionType})
                  </option>
                )}
              </select>

              <ActionFields
                action={action}
                onChange={(next) => update(index, next)}
                themeKeys={themeKeys}
              />

              <button
                type="button"
                aria-label="Șterge acțiunea"
                className="rb-icon-btn ml-auto"
                onClick={() => onChange(actions.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {actions.length === 0 && (
          <p className="rb-slot" data-over={isOver || undefined}>
            Trage o acțiune aici
          </p>
        )}

        <button
          type="button"
          className="rb-add-btn self-start"
          onClick={() =>
            onChange([...actions, defaultActionFor(decisionType)])
          }
        >
          + acțiune
        </button>
      </div>
    </div>
  );
}

function ActionFields({
  action,
  onChange,
  themeKeys,
}: {
  action: Action;
  onChange: (next: Action) => void;
  themeKeys: string[];
}) {
  switch (action.type) {
    case "discountPercent":
      return (
        <NumberField
          label="Procent"
          suffix="%"
          value={action.value}
          min={0}
          max={100}
          onChange={(value) => onChange({ ...action, value })}
        />
      );

    case "setFixedPrice":
      return (
        <NumberField
          label="Preț"
          suffix="RON"
          value={action.value}
          min={0}
          onChange={(value) => onChange({ ...action, value })}
        />
      );

    case "setShipping":
    case "addShippingOption":
      return (
        <>
          <TextField
            label="Metodă"
            value={action.method}
            onChange={(method) => onChange({ ...action, method })}
          />
          <NumberField
            label="Cost"
            suffix="RON"
            value={action.cost}
            min={0}
            onChange={(cost) => onChange({ ...action, cost })}
          />
          {action.type === "addShippingOption" && (
            <TextField
              label="Etichetă"
              value={action.label ?? ""}
              onChange={(label) => onChange({ ...action, label })}
            />
          )}
        </>
      );

    case "blockCheckout":
      return (
        <TextField
          label="Motiv"
          wide
          value={action.reason}
          placeholder="văzut de client"
          onChange={(reason) => onChange({ ...action, reason })}
        />
      );

    case "flagFraud":
      return (
        <>
          <NumberField
            label="Scor"
            value={action.score}
            min={0}
            max={100}
            onChange={(score) => onChange({ ...action, score })}
          />
          <TextField
            label="Motiv"
            value={action.reason ?? ""}
            onChange={(reason) => onChange({ ...action, reason })}
          />
        </>
      );

    case "setAvailability":
      return (
        <>
          <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
            Disponibil
            <select
              className="rb-reporter"
              value={action.available ? "true" : "false"}
              onChange={(e) =>
                onChange({ ...action, available: e.target.value === "true" })
              }
            >
              <option value="true">da</option>
              <option value="false">nu</option>
            </select>
          </label>
          <TextField
            label="Motiv"
            value={action.reason ?? ""}
            onChange={(reason) => onChange({ ...action, reason })}
          />
        </>
      );

    case "grantLoyalty":
      return (
        <NumberField
          label="Puncte"
          value={action.points}
          onChange={(points) =>
            onChange({ ...action, points: Math.round(points) })
          }
        />
      );

    case "setTheme":
      return themeKeys.length > 0 ? (
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          Temă
          <select
            className="rb-reporter"
            value={action.themeId}
            onChange={(event) =>
              onChange({ ...action, themeId: event.target.value })
            }
          >
            <option value="">— alege —</option>
            {themeKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
            {action.themeId && !themeKeys.includes(action.themeId) && (
              <option value={action.themeId}>
                {action.themeId} (inexistentă)
              </option>
            )}
          </select>
        </label>
      ) : (
        <span className="text-xs text-[var(--warn)]">
          Magazinul nu are teme definite.
        </span>
      );

    case "set":
      return (
        <>
          <TextField
            label="Cheie"
            value={action.path}
            placeholder="ex. banner"
            onChange={(path) => onChange({ ...action, path })}
          />
          <TextField
            label="Valoare"
            value={typeof action.value === "string" ? action.value : ""}
            onChange={(value) => onChange({ ...action, value })}
          />
        </>
      );
  }
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
      {label}
      <input
        type="number"
        step="any"
        min={min}
        max={max}
        className="rb-reporter w-24"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
      {label}
      <input
        className={`rb-reporter ${wide ? "w-56" : "w-32"}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
