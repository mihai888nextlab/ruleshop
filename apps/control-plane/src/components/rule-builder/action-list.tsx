"use client";

import type { Action, DecisionType } from "@ruleshop/engine";

/**
 * Action blocks: what a rule does when it matches.
 *
 * Each action type gets its own typed fields rather than a generic key/value
 * editor, and the palette only offers the actions that make sense for the rule's
 * decision type — a shipping rule cannot grant loyalty points, because nothing
 * would read that decision at the point shipping is resolved.
 */

type ActionType = Action["type"];

interface ActionMeta {
  type: ActionType;
  label: string;
  hint: string;
  /** Decision types where this action has an effect. */
  scopes: DecisionType[];
  create: () => Action;
}

const ACTIONS: ActionMeta[] = [
  {
    type: "discountPercent",
    label: "Reducere procentuală",
    hint: "scade un procent din preț",
    scopes: ["pricing"],
    create: () => ({ type: "discountPercent", value: 10 }),
  },
  {
    type: "setFixedPrice",
    label: "Preț fix",
    hint: "înlocuiește prețul complet",
    scopes: ["pricing"],
    create: () => ({ type: "setFixedPrice", value: 0 }),
  },
  {
    type: "setShipping",
    label: "Metodă de livrare impusă",
    hint: "o singură opțiune, cu cost",
    scopes: ["shipping"],
    create: () => ({ type: "setShipping", method: "standard", cost: 0 }),
  },
  {
    type: "addShippingOption",
    label: "Adaugă opțiune de livrare",
    hint: "se cumulează cu alte opțiuni",
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
    hint: "oprește finalizarea, cu motiv",
    scopes: ["fraud"],
    create: () => ({ type: "blockCheckout", reason: "" }),
  },
  {
    type: "flagFraud",
    label: "Marchează risc",
    hint: "scor 0–100, fără a bloca",
    scopes: ["fraud"],
    create: () => ({ type: "flagFraud", score: 50, reason: "" }),
  },
  {
    type: "setAvailability",
    label: "Disponibilitate",
    hint: "ascunde sau afișează produsul",
    scopes: ["availability"],
    create: () => ({ type: "setAvailability", available: false, reason: "" }),
  },
  {
    type: "grantLoyalty",
    label: "Acordă puncte",
    hint: "puncte de loialitate",
    scopes: ["loyalty"],
    create: () => ({ type: "grantLoyalty", points: 10 }),
  },
  {
    type: "setTheme",
    label: "Temă vizuală",
    hint: "schimbă aspectul magazinului",
    scopes: ["theme"],
    create: () => ({ type: "setTheme", themeId: "" }),
  },
  {
    type: "set",
    label: "Câmp personalizat",
    hint: "scrie orice cheie în decizie",
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

const inputClass =
  "rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:border-white/40 placeholder:text-white/30";

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
  /** Themes this store has defined, so setTheme picks rather than types. */
  themeKeys: string[];
}) {
  const available = actionsForScope(decisionType);

  function update(index: number, next: Action) {
    onChange(actions.map((a, i) => (i === index ? next : a)));
  }

  return (
    <div className="rounded-lg bg-[#12161f] p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-violet-400/25 px-2 py-0.5 text-xs font-semibold text-violet-100">
          ATUNCI
        </span>
        <span className="text-xs text-white/40">
          acțiunile aplicate când condițiile sunt îndeplinite
        </span>
      </div>

      {errors.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {errors.map((error, i) => (
            <li key={i} className="text-xs text-rose-300">
              {error}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {actions.map((action, index) => (
          <div
            key={index}
            className="rounded-lg border-2 border-violet-400/50 bg-violet-500/10 p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Tip acțiune"
                className={inputClass}
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
                {/* An action stored before the category changed stays visible so
                    it can be seen and removed, rather than vanishing silently. */}
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
                className="ml-auto rounded px-1.5 py-0.5 text-xs text-white/50 hover:bg-white/10 hover:text-white"
                onClick={() => onChange(actions.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>

            <p className="mt-1 text-[10px] text-white/30">
              {ACTIONS.find((a) => a.type === action.type)?.hint}
            </p>
          </div>
        ))}

        {actions.length === 0 && (
          <p className="rounded border border-dashed border-white/20 px-2 py-3 text-center text-xs text-white/35">
            O regulă are nevoie de cel puțin o acțiune.
          </p>
        )}

        <button
          type="button"
          className="self-start rounded border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-white/70 hover:border-white/40 hover:text-white"
          onClick={() => onChange([...actions, defaultActionFor(decisionType)])}
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
          <label className="flex items-center gap-1 text-xs text-white/60">
            Disponibil
            <select
              className={inputClass}
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
          onChange={(points) => onChange({ ...action, points: Math.round(points) })}
        />
      );

    case "setTheme":
      // A select over defined themes: a mistyped key would resolve to nothing
      // and silently leave the cohort on the default theme.
      return themeKeys.length > 0 ? (
        <label className="flex items-center gap-1 text-xs text-white/60">
          Temă
          <select
            className={inputClass}
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
        <span className="text-xs text-amber-300/80">
          Magazinul nu are teme definite — creează una în secțiunea Teme.
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
    <label className="flex items-center gap-1 text-xs text-white/60">
      {label}
      <input
        type="number"
        step="any"
        min={min}
        max={max}
        className={`${inputClass} w-24`}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span className="text-white/40">{suffix}</span>}
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
    <label className="flex items-center gap-1 text-xs text-white/60">
      {label}
      <input
        className={`${inputClass} ${wide ? "w-56" : "w-32"}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
