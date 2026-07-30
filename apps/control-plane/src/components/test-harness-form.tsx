"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import type { DecisionType } from "@ruleshop/engine";
import { Button } from "./ui/button";

const DECISION_TYPES: DecisionType[] = [
  "pricing",
  "shipping",
  "fraud",
  "availability",
  "loyalty",
  "theme",
];

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
  const t = useT();
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
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          {DECISION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`rules.categories.${type}`)}
            </option>
          ))}
        </select>
        <input
          name="version"
          placeholder={t("test.versionPlaceholder")}
          defaultValue={defaultVersion}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
      </div>
      <textarea
        name="context"
        defaultValue={defaultContext}
        className="min-h-48 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-xs"
      />
      <Button type="submit">{t("test.evaluate")}</Button>
    </form>
  );
}
