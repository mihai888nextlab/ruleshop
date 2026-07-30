"use client";

import type { ComparisonOp, FieldDef } from "@ruleshop/engine";

/**
 * Value editor for one condition — Scratch-like reporter slots on the light
 * control-plane canvas.
 */

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
  if (op === "exists") {
    return <span className="text-xs text-[var(--muted)]">(fără valoare)</span>;
  }

  if (op === "contains") {
    return (
      <input
        aria-label="Valoare"
        className="rb-reporter w-40"
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
        className="rb-reporter w-40"
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
          className="rb-reporter w-28"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === "" ? "" : Number(next));
          }}
        />
      );

    case "boolean":
      return (
        <select
          aria-label="Valoare"
          className="rb-reporter w-24"
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
          className="rb-reporter w-40"
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
          className="rb-reporter w-40"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "string":
      return (
        <input
          aria-label="Valoare"
          className="rb-reporter w-40"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

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
                "cursor-pointer rounded-[8px] border px-2 py-0.5 text-xs transition " +
                (checked
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--fg)]")
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
            className={`rb-reporter ${isDate ? "w-36" : "w-24"}`}
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
            className="rb-icon-btn"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="rb-add-btn"
        onClick={() => onChange([...items, isNumber ? 0 : ""])}
      >
        + valoare
      </button>
    </div>
  );
}
