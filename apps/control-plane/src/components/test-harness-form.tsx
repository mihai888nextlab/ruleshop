"use client";

import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

export function TestHarnessForm({
  slug,
  defaultType,
  defaultVersion,
  defaultContext,
}: {
  slug: string;
  defaultType: string;
  defaultVersion: string;
  defaultContext: string;
}) {
  const router = useRouter();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const q = new URLSearchParams({
          type: String(fd.get("type")),
          version: String(fd.get("version") || ""),
          context: String(fd.get("context")),
        });
        router.push(`/s/${slug}/rules/test?${q.toString()}`);
      }}
    >
      <div className="flex flex-wrap gap-3">
        <select
          name="type"
          defaultValue={defaultType}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          {["pricing", "shipping", "fraud", "availability", "loyalty", "theme"].map(
            (t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ),
          )}
        </select>
        <input
          name="version"
          placeholder="versiune (gol = live)"
          defaultValue={defaultVersion}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
      </div>
      <textarea
        name="context"
        defaultValue={defaultContext}
        className="min-h-48 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-xs"
      />
      <Button type="submit">Evaluează</Button>
    </form>
  );
}
