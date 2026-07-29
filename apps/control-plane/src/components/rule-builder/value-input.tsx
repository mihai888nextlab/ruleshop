"use client";

import type { ComparisonOp, FieldDef } from "@ruleshop/engine";

/**
 * Value editor for one condition.
 *
 * The control rendered is decided by the field's declared type, not by the
 * author's discipline: a date field gets a date picker, an enum gets a select
 * limited to its options, a number gets a numeric input. That is what stops
 * type-mismatched values being entered in the first place, with validation as
 * the backstop rather than the only defence.
 */

const inputClass =
  "rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white " +
  "outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 " +
  "placeholder:text-white/30";

export function ValueInput({
  field,
  op,
  value,
  onChange,
}: {
  field: FieldDef | undefined;
  op: ComparisonOp;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  // `exists` only asks whether the fact was supplied, so there is nothing to
  // compare against.
  if (op === "exists") {
    return (
      <span className="text-xs text-white/40">(fără valoare)</span>
    );
  }

  // A substring test is always textual, whatever the field's type.
  if (op === "contains") {
    return (
      <input
        aria-label="Valoare"
        className={`${inputClass} w-40`}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="text căutat"
      />
    );
  }

  if (op === "in") {
    return <ListInput field={field} value={value} onChange={onChange} />;
  }

  if (!field) {
    return (
      <input
        aria-label="Valoare"
        className={`${inputClass} w-40`}
        value={typeof value === "string" ? value : String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  switch (field.type) {
    case "number":
      return (
        <input
          aria-label="Valoare"
          type="number"
          step="any"
          className={`${inputClass} w-28`}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            const next = e.target.value;
            // Keep the raw text when it is not yet a number so the field does
            // not fight the user mid-typing; validation reports it if it stays
            // that way.
            onChange(next === "" ? "" : Number(next));
          }}
        />
      );

    case "boolean":
      return (
        <select
          aria-label="Valoare"
          className={`${inputClass} w-24`}
          value={value === true ? "true" : "false"}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option value="true">da</option>
          <option value="false">nu</option>
        </select>
      );

    case "enum":
      return (
        <select
          aria-label="Valoare"
          className={`${inputClass} w-40`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case "date":
      return (
        <input
          aria-label="Valoare"
          type="date"
          className={`${inputClass} w-40`}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "string":
      return (
        <input
          aria-label="Valoare"
          className={`${inputClass} w-40`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/**
 * Editor for `in` lists.
 *
 * An enum renders as checkboxes over its declared options, since those are the
 * only legal members. Other types get one input per entry, because free text
 * split on a separator would mangle values that legitimately contain it.
 */
function ListInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items = Array.isArray(value) ? value : [];

  if (field?.type === "enum") {
    const options = field.options ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = items.includes(option);
          return (
            <label
              key={option}
              className={
                "cursor-pointer rounded border px-2 py-0.5 text-xs transition " +
                (checked
                  ? "border-white/40 bg-white/20 text-white"
                  : "border-white/15 bg-black/20 text-white/60 hover:border-white/30")
              }
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? items.filter((i) => i !== option)
                      : [...items, option],
                  )
                }
              />
              {option}
            </label>
          );
        })}
      </div>
    );
  }

  const isNumber = field?.type === "number";
  const isDate = field?.type === "date";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          <input
            aria-label={`Valoare ${index + 1}`}
            type={isNumber ? "number" : isDate ? "date" : "text"}
            step={isNumber ? "any" : undefined}
            className={`${inputClass} ${isDate ? "w-36" : "w-24"}`}
            value={
              typeof item === "number" || typeof item === "string"
                ? String(item)
                : ""
            }
            onChange={(e) => {
              const raw = e.target.value;
              const next = [...items];
              next[index] = isNumber ? (raw === "" ? "" : Number(raw)) : raw;
              onChange(next);
            }}
          />
          <button
            type="button"
            aria-label={`Elimină valoarea ${index + 1}`}
            className="text-white/40 hover:text-white"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="rounded border border-white/20 px-2 py-0.5 text-xs text-white/70 hover:border-white/40 hover:text-white"
        onClick={() => onChange([...items, isNumber ? 0 : isDate ? "" : ""])}
      >
        + valoare
      </button>
    </div>
  );
}
