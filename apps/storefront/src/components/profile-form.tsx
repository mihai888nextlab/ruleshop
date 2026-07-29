"use client";

import { useActionState } from "react";
import type { ProfileField } from "@ruleshop/contracts";
import type { ActionState } from "@/app/actions";

/**
 * Renders a form for a schema the storefront learns at request time.
 *
 * Nothing here knows what fields this store has. The control plane describes
 * them — key, label, type, options — and the input rendered follows the declared
 * type, which is the same type that decides which operators a rule may use
 * against the value. An administrator adding an attribute therefore needs no
 * storefront deploy.
 */
export function ProfileForm({
  action,
  fields,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: ProfileField[];
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Acest magazin nu a definit încă date de profil.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} />
      ))}

      {state?.error && (
        <p
          role="alert"
          className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      {state?.notice && (
        <p
          role="status"
          className="border-l-2 border-[var(--positive)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        >
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? "Se salvează…" : "Salvează profilul"}
      </button>
    </form>
  );
}

function FieldInput({ field }: { field: ProfileField }) {
  // Prefixed so the server action can tell attribute values apart from any other
  // form field without needing to know the store's schema.
  const name = `attr:${field.key}`;
  const inputClass =
    "border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]";

  const label = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span>{field.label}</span>
      {field.required && (
        <span className="text-xs text-[var(--muted)]">(obligatoriu)</span>
      )}
    </span>
  );

  const description = field.description ? (
    <span className="text-xs text-[var(--muted)]">{field.description}</span>
  ) : null;

  switch (field.type) {
    case "boolean":
      return (
        <label className="flex items-start gap-3 text-sm">
          <input
            name={name}
            type="checkbox"
            value="on"
            defaultChecked={field.value === true}
            className="mt-1"
          />
          <span className="flex flex-col gap-0.5">
            {label}
            {description}
          </span>
        </label>
      );

    case "enum":
      return (
        <label className="flex flex-col gap-1 text-sm">
          {label}
          <select
            name={name}
            required={field.required}
            defaultValue={typeof field.value === "string" ? field.value : ""}
            className={inputClass}
          >
            <option value="">— nespecificat —</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {description}
        </label>
      );

    case "date":
      return (
        <label className="flex flex-col gap-1 text-sm">
          {label}
          <input
            name={name}
            type="date"
            required={field.required}
            defaultValue={
              typeof field.value === "string" ? field.value.slice(0, 10) : ""
            }
            className={inputClass}
          />
          {description}
        </label>
      );

    case "number":
      return (
        <label className="flex flex-col gap-1 text-sm">
          {label}
          <input
            name={name}
            type="number"
            step="any"
            required={field.required}
            defaultValue={
              typeof field.value === "number" ? String(field.value) : ""
            }
            className={inputClass}
          />
          {description}
        </label>
      );

    case "string":
      return (
        <label className="flex flex-col gap-1 text-sm">
          {label}
          <input
            name={name}
            required={field.required}
            defaultValue={typeof field.value === "string" ? field.value : ""}
            className={inputClass}
          />
          {description}
        </label>
      );
  }
}
