import { useState, type FormEvent } from "react";
import { saveProfile } from "@/lib/api";
import type { ProfileField } from "@/lib/types";

export function ProfileForm({
  fields: initialFields,
}: {
  fields: ProfileField[];
}) {
  const [fields, setFields] = useState(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Acest magazin nu a definit încă date de profil.
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = form.get(`attr:${field.key}`);
      if (field.type === "boolean") {
        values[field.key] = form.get(`attr:${field.key}`) === "on";
      } else if (raw !== null && String(raw).length > 0) {
        values[field.key] = String(raw);
      } else {
        values[field.key] = null;
      }
    }

    const result = await saveProfile(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFields(result.data.fields);
    if (!result.data.ok) {
      const first = Object.values(result.data.errors)[0];
      setError(first ?? "Date invalide");
      return;
    }
    setNotice("Profilul a fost salvat.");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} />
      ))}

      {error && (
        <p
          role="alert"
          className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="border-l-2 border-[var(--positive)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        >
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn self-start disabled:opacity-60"
      >
        {pending ? "Se salvează…" : "Salvează profilul"}
      </button>
    </form>
  );
}

function FieldInput({ field }: { field: ProfileField }) {
  const name = `attr:${field.key}`;
  const label = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span>{field.label}</span>
      {field.required && (
        <span className="text-xs text-[var(--muted)]">(obligatoriu)</span>
      )}
    </span>
  );

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name={name}
          defaultChecked={Boolean(field.value)}
        />
        {label}
      </label>
    );
  }

  if (field.type === "enum" && field.options.length > 0) {
    return (
      <label className="flex flex-col gap-1 text-sm">
        {label}
        <select
          name={name}
          defaultValue={field.value == null ? "" : String(field.value)}
          className="field"
          required={field.required}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : "text";

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {field.description && (
        <span className="text-xs text-[var(--muted)]">{field.description}</span>
      )}
      <input
        name={name}
        type={inputType}
        defaultValue={field.value == null ? "" : String(field.value)}
        required={field.required}
        className="field"
      />
    </label>
  );
}
