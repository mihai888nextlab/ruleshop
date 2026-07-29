"use client";

import { useState, useTransition } from "react";
import { OPERATORS_BY_TYPE, customAttributePath } from "@ruleshop/engine";
import type { FieldType } from "@ruleshop/engine";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/**
 * Editor for a store's customer attribute definitions.
 *
 * Each row shows the rule path the attribute produces and the operators its type
 * permits, because that is the reason to define one: it is how the field becomes
 * usable in the rule editor.
 */

export interface AttributeRow {
  id: string;
  key: string;
  label: string;
  description: string;
  type: FieldType;
  options: string[];
  required: boolean;
  showOnProfile: boolean;
  archived: boolean;
}

const TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "string", label: "Text", hint: "nume, cod, observație" },
  { value: "number", label: "Număr", hint: "vârstă, recomandări, prag" },
  { value: "boolean", label: "Da / Nu", hint: "abonat, acceptă marketing" },
  { value: "enum", label: "Listă de opțiuni", hint: "oraș, plan, segment" },
  { value: "date", label: "Dată", hint: "zi de naștere, dată înscriere" },
];

type Actions = {
  onCreate: (input: unknown) => Promise<{ id: string }>;
  onUpdate: (id: string, input: unknown) => Promise<{ ok: boolean }>;
  onArchive: (id: string, archived: boolean) => Promise<{ ok: boolean }>;
  onDelete: (id: string) => Promise<{ ok: boolean }>;
};

export function AttributeManager({
  attributes,
  actions,
}: {
  attributes: AttributeRow[];
  actions: Actions;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Operațiune eșuată");
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <NewAttributeForm
        disabled={pending}
        onSubmit={(input) => run(() => actions.onCreate(input))}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Atribute definite ({attributes.length})
        </h2>

        {attributes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
            Niciun atribut definit. Atributele adăugate aici devin variabile în
            editorul de reguli și câmpuri în profilul clientului.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {attributes.map((attribute) => (
              <AttributeCard
                key={attribute.id}
                attribute={attribute}
                disabled={pending}
                onUpdate={(input) =>
                  run(() => actions.onUpdate(attribute.id, input))
                }
                onArchive={(archived) =>
                  run(() => actions.onArchive(attribute.id, archived))
                }
                onDelete={() => run(() => actions.onDelete(attribute.id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewAttributeForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (input: unknown) => void;
  disabled: boolean;
}) {
  const [type, setType] = useState<FieldType>("string");
  const [optionsText, setOptionsText] = useState("");

  const selected = TYPES.find((t) => t.value === type)!;

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
      action={(formData) => {
        onSubmit({
          key: String(formData.get("key") ?? ""),
          label: String(formData.get("label") ?? ""),
          description: String(formData.get("description") ?? ""),
          type,
          options:
            type === "enum"
              ? optionsText
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean)
              : [],
          required: formData.get("required") === "on",
          showOnProfile: formData.get("showOnProfile") === "on",
        });
        setOptionsText("");
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">Atribut nou</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Definește un câmp de client. Va apărea în editorul de reguli ca
          variabilă tipizată și în profilul clientului ca formular.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Cheie</span>
          <Input
            name="key"
            required
            pattern="[a-z][a-z0-9_]*"
            placeholder="oras"
            title="Litere mici, cifre și _, începând cu o literă"
          />
          <span className="text-xs text-[var(--muted)]">
            Folosită în reguli. Nu se poate schimba ulterior.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Etichetă</span>
          <Input name="label" required placeholder="Oraș" maxLength={80} />
          <span className="text-xs text-[var(--muted)]">
            Textul văzut de client și de autorul regulii.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tip de date</span>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--muted)]">
            Determină operatorii permiși: {OPERATORS_BY_TYPE[type].join(", ")}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Descriere</span>
          <Input
            name="description"
            placeholder="Opțional — pentru autorii de reguli"
            maxLength={300}
          />
        </label>
      </div>

      {type === "enum" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Opțiuni permise</span>
          <Input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Cluj, Iași, Timișoara"
            required
          />
          <span className="text-xs text-[var(--muted)]">
            Separate prin virgulă. Regulile pot compara doar cu aceste valori.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showOnProfile" defaultChecked />
          Vizibil în profilul clientului
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" />
          Obligatoriu
        </label>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Cale generată în reguli:{" "}
        <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
          {customAttributePath("cheie")}
        </code>{" "}
        · tip {selected.label.toLowerCase()}
      </p>

      <Button type="submit" disabled={disabled} className="self-start">
        Adaugă atribut
      </Button>
    </form>
  );
}

function AttributeCard({
  attribute,
  onUpdate,
  onArchive,
  onDelete,
  disabled,
}: {
  attribute: AttributeRow;
  onUpdate: (input: unknown) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const typeLabel =
    TYPES.find((t) => t.value === attribute.type)?.label ?? attribute.type;

  return (
    <li
      className={
        "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 " +
        (attribute.archived ? "opacity-60" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{attribute.label}</h3>
            <Badge tone="accent">{typeLabel}</Badge>
            {attribute.required && <Badge tone="warn">obligatoriu</Badge>}
            {!attribute.showOnProfile && (
              <Badge tone="muted">ascuns în profil</Badge>
            )}
            {attribute.archived && <Badge tone="muted">arhivat</Badge>}
          </div>

          {attribute.description && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {attribute.description}
            </p>
          )}

          <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">
            {customAttributePath(attribute.key)}
          </p>

          <p className="mt-1 text-xs text-[var(--muted)]">
            Operatori: {OPERATORS_BY_TYPE[attribute.type].join(", ")}
          </p>

          {attribute.type === "enum" && attribute.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {attribute.options.map((option) => (
                <Badge key={option} tone="default">
                  {option}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Anulează" : "Editează"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onArchive(!attribute.archived)}
          >
            {attribute.archived ? "Restaurează" : "Arhivează"}
          </Button>
          {confirmingDelete ? (
            <Button
              variant="danger"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              Confirmă ștergerea
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setConfirmingDelete(true)}
            >
              Șterge
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2"
          action={(formData) => {
            const raw = String(formData.get("options") ?? "");
            onUpdate({
              label: String(formData.get("label") ?? ""),
              description: String(formData.get("description") ?? ""),
              required: formData.get("required") === "on",
              showOnProfile: formData.get("showOnProfile") === "on",
              ...(attribute.type === "enum"
                ? {
                    options: raw
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean),
                  }
                : {}),
            });
            setEditing(false);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Etichetă
            <Input name="label" defaultValue={attribute.label} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Descriere
            <Input name="description" defaultValue={attribute.description} />
          </label>

          {attribute.type === "enum" && (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Opțiuni (separate prin virgulă)
              <Input
                name="options"
                defaultValue={attribute.options.join(", ")}
                required
              />
            </label>
          )}

          <div className="flex flex-wrap gap-6 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="showOnProfile"
                defaultChecked={attribute.showOnProfile}
              />
              Vizibil în profil
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="required"
                defaultChecked={attribute.required}
              />
              Obligatoriu
            </label>
          </div>

          <p className="text-xs text-[var(--muted)] sm:col-span-2">
            Cheia și tipul nu pot fi modificate: regulile publicate depind de
            ambele. Pentru alt tip, creează un atribut nou.
          </p>

          <Button type="submit" size="sm" disabled={disabled} className="self-start">
            Salvează
          </Button>
        </form>
      )}
    </li>
  );
}
