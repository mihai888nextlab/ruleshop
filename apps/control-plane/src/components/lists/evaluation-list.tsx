"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n-provider";
import type { TranslateFn } from "@/i18n/dictionary";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { DecisionPanel } from "@/components/decision-panel";
import { Badge } from "@/components/ui/badge";

export type EvaluationExplanationStep = {
  ruleKey: string;
  ruleName?: string;
  matched: boolean;
  reason: string;
  appliedActions?: unknown[];
};

export type EvaluationListItem = {
  id: string;
  decisionType: string;
  rulesetVersion: number | null;
  isCanary: boolean;
  matchedRules: string[];
  createdAt: string;
  subjectKey: string | null;
  decision: Record<string, unknown>;
  explanation: EvaluationExplanationStep[];
  warnings: string[];
};

export function EvaluationList({
  slug,
  evaluations,
}: {
  slug: string;
  evaluations: EvaluationListItem[];
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const types = [...new Set(evaluations.map((e) => e.decisionType))].sort();

  const list = useListQuery({
    items: evaluations,
    searchText: (e) =>
      `${e.decisionType} ${e.matchedRules.join(" ")} ${e.subjectKey ?? ""} ${e.id} ${e.explanation.map((s) => `${s.ruleKey} ${s.ruleName ?? ""}`).join(" ")}`,
    filters: [
      {
        key: "type",
        predicate: (e, v) => e.decisionType === v,
      },
      {
        key: "canary",
        predicate: (e, v) => (v === "yes" ? e.isCanary : !e.isCanary),
      },
    ],
    sorts: {
      dateDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
      dateAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
      type: (a, b) => a.decisionType.localeCompare(b.decisionType),
    },
    defaultSort: "dateDesc",
  });

  return (
    <div className="flex flex-col gap-3">
      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t("evaluations.search")}
        filters={[
          {
            key: "type",
            label: t("evaluations.type"),
            options: types.map((type) => ({
              value: type,
              label: t(`rules.categories.${type}` as "rules.categories.pricing"),
            })),
          },
          {
            key: "canary",
            label: t("evaluations.canary"),
            options: [
              { value: "yes", label: t("common.yes") },
              { value: "no", label: t("common.no") },
            ],
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "dateDesc", label: t("evaluations.sortDateDesc") },
          { value: "dateAsc", label: t("evaluations.sortDateAsc") },
          { value: "type", label: t("evaluations.type") },
        ]}
        sort={list.sort}
        onSortChange={list.setSort}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
      />

      {list.filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          {t("common.noResults")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.filtered.map((e) => {
            const open = openId === e.id;
            return (
              <li key={e.id} className="panel overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : e.id)}
                  className="flex w-full flex-col gap-1 p-3 text-left text-sm transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{e.decisionType}</Badge>
                    {e.rulesetVersion != null && (
                      <Badge tone="muted">v{e.rulesetVersion}</Badge>
                    )}
                    {e.isCanary && (
                      <Badge tone="warn">{t("evaluations.canary")}</Badge>
                    )}
                    <span className="text-[var(--muted)]">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      {open ? t("common.hide") : t("common.details")}
                    </span>
                  </div>
                  <p>
                    {t("evaluations.rules")}{" "}
                    {e.matchedRules.join(", ") || "—"}
                  </p>
                  <p className="font-mono text-xs text-[var(--muted)]">
                    {e.subjectKey ?? e.id}
                  </p>
                </button>

                {open && (
                  <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <DecisionPanel
                      title={t("evaluations.result")}
                      matchedRules={e.matchedRules}
                      rulesetVersion={e.rulesetVersion}
                      isCanary={e.isCanary}
                      explanation={e.explanation.map((step) => ({
                        ruleKey: step.ruleKey,
                        matched: step.matched,
                        reason: step.reason,
                      }))}
                      decision={e.decision}
                      warnings={e.warnings}
                    />

                    <RuleTrace
                      slug={slug}
                      rulesetVersion={e.rulesetVersion}
                      explanation={e.explanation}
                      matchedRules={e.matchedRules}
                      t={t}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RuleTrace({
  slug,
  rulesetVersion,
  explanation,
  matchedRules,
  t,
}: {
  slug: string;
  rulesetVersion: number | null;
  explanation: EvaluationExplanationStep[];
  matchedRules: string[];
  t: TranslateFn;
}) {
  const matched = explanation.filter((s) => s.matched);
  const considered = explanation.filter((s) => !s.matched);
  const versionHref =
    rulesetVersion != null ? `/s/${slug}/rules/${rulesetVersion}` : null;

  if (explanation.length === 0 && matchedRules.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--muted)]">
        {t("evaluations.emptyTrace")}
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {t("evaluations.matched")}
        </h3>
        {matched.length === 0 && matchedRules.length === 0 ? (
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {t("evaluations.none")}
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-2">
            {(matched.length > 0
              ? matched
              : matchedRules.map(
                  (key): EvaluationExplanationStep => ({
                    ruleKey: key,
                    ruleName: key,
                    matched: true,
                    reason: t("evaluations.matchedLabel"),
                  }),
                )
            ).map((step) => (
              <li
                key={step.ruleKey}
                className="squircle rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {step.ruleName || step.ruleKey}
                    </p>
                    <p className="font-mono text-xs text-[var(--muted)]">
                      {step.ruleKey}
                    </p>
                  </div>
                  {versionHref && (
                    <Link
                      href={versionHref}
                      className="shrink-0 text-xs font-medium text-[var(--fg)] underline-offset-2 hover:underline"
                    >
                      {t("evaluations.openVersion", { n: rulesetVersion ?? "" })}
                    </Link>
                  )}
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{step.reason}</p>
                {Array.isArray(step.appliedActions) &&
                  step.appliedActions.length > 0 && (
                    <pre className="mt-2 overflow-x-auto rounded-[var(--radius)] bg-[var(--surface-2)] p-2 text-xs">
                      {JSON.stringify(step.appliedActions, null, 2)}
                    </pre>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {considered.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-[var(--muted)] hover:text-[var(--fg)]">
            {t("evaluations.otherRulesCount", { n: considered.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {considered.map((step) => (
              <li
                key={step.ruleKey}
                className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-3 py-2"
              >
                <span className="font-medium">
                  {step.ruleName || step.ruleKey}
                </span>
                <span className="text-[var(--muted)]"> — {step.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
