"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AiProposeForm({
  onPropose,
}: {
  onPropose: (prompt: string, category: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      action={async (fd) => {
        setLoading(true);
        setError("");
        try {
          await onPropose(String(fd.get("prompt")), String(fd.get("category")));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Eroare");
        } finally {
          setLoading(false);
        }
      }}
    >
      <h2 className="font-medium">Generează regulă din limbaj natural</h2>
      <Input
        name="prompt"
        placeholder="Ex: reducere 20% pentru clienți VIP la categoria shoes"
        required
      />
      <select
        name="category"
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        defaultValue="pricing"
      >
        {["pricing", "shipping", "fraud", "availability", "loyalty", "theme"].map(
          (c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ),
        )}
      </select>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Se generează…" : "Propune regulă"}
      </Button>
    </form>
  );
}
