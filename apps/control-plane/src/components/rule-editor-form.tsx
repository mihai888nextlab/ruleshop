"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const CATEGORIES = [
  "pricing",
  "shipping",
  "fraud",
  "availability",
  "loyalty",
  "theme",
] as const;

const ACTION_TYPES = [
  "discountPercent",
  "setFixedPrice",
  "setShipping",
  "addShippingOption",
  "blockCheckout",
  "flagFraud",
  "setAvailability",
  "grantLoyalty",
  "setTheme",
  "set",
] as const;

type RuleFormProps = {
  initial?: {
    key: string;
    name: string;
    description?: string;
    category: string;
    priority: number;
    enabled: boolean;
    conditions: unknown;
    actions: unknown;
  };
  onSave: (rule: unknown) => Promise<void>;
};

export function RuleEditorForm({ initial, onSave }: RuleFormProps) {
  const [error, setError] = useState("");
  const [conditionsJson, setConditionsJson] = useState(
    JSON.stringify(
      initial?.conditions ?? { op: "eq", path: "customer.tier", value: "vip" },
      null,
      2,
    ),
  );
  const [actionsJson, setActionsJson] = useState(
    JSON.stringify(
      initial?.actions ?? [{ type: "discountPercent", value: 10 }],
      null,
      2,
    ),
  );

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      action={async (fd) => {
        setError("");
        try {
          const conditions = JSON.parse(conditionsJson);
          const actions = JSON.parse(actionsJson);
          await onSave({
            key: String(fd.get("key")),
            name: String(fd.get("name")),
            description: String(fd.get("description") || ""),
            category: String(fd.get("category")),
            priority: Number(fd.get("priority")),
            enabled: fd.get("enabled") === "on",
            conditions,
            actions,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Eroare la salvare");
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Key (slug)
          <Input name="key" defaultValue={initial?.key} required pattern="[a-z0-9-]+" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nume
          <Input name="name" defaultValue={initial?.name} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Categorie
          <select
            name="category"
            defaultValue={initial?.category ?? "pricing"}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Prioritate
          <Input
            name="priority"
            type="number"
            defaultValue={initial?.priority ?? 100}
            required
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Descriere
        <Input name="description" defaultValue={initial?.description} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="enabled" type="checkbox" defaultChecked={initial?.enabled ?? true} />
        Activată
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Condiții (JSON AST — and/or/not + operatori)
        <textarea
          className="min-h-32 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-xs"
          value={conditionsJson}
          onChange={(e) => setConditionsJson(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Acțiuni (JSON) — tipuri: {ACTION_TYPES.join(", ")}
        <textarea
          className="min-h-28 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-xs"
          value={actionsJson}
          onChange={(e) => setActionsJson(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit">Salvează regula</Button>
    </form>
  );
}
