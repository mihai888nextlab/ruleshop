"use client";

import { useMemo, useState, useTransition } from "react";
import type { DecisionType } from "@ruleshop/engine";
import { useT } from "@/components/i18n-provider";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SuggestionCard, type SuggestionView } from "./suggestion-card";

/**
 * The AI workbench.
 *
 * Every entry point produces a reviewable suggestion rather than acting directly,
 * and each one states which part is measured and which part is the model's
 * opinion. The analysis button works with no API key at all, because the findings
 * behind it are computed here.
 */

const CATEGORY_VALUES: DecisionType[] = [
  "pricing",
  "shipping",
  "fraud",
  "availability",
  "loyalty",
  "theme",
];

export interface AiConsoleActions {
  analyze: () => Promise<unknown>;
  propose: (prompt: string, category: DecisionType) => Promise<unknown>;
  improve: (ruleKey: string) => Promise<unknown>;
  explainDiff: (from: number, to: number) => Promise<unknown>;
  simulate: (id: string) => Promise<unknown>;
  simulateVersion: (version: number) => Promise<unknown>;
  triageFraud: () => Promise<unknown>;
  review: (
    id: string,
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<unknown>;
}

export function AiConsole({
  actions,
  suggestions,
  liveRuleKeys,
  versions,
  liveVersion,
  aiConfigured,
}: {
  actions: AiConsoleActions;
  suggestions: SuggestionView[];
  liveRuleKeys: string[];
  versions: number[];
  liveVersion: number | null;
  aiConfigured: boolean;
}) {
  const t = useT();
  const categories = useMemo(
    () =>
      CATEGORY_VALUES.map((value) => ({
        value,
        label: t(`rules.categories.${value}`),
      })),
    [t],
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<DecisionType>("pricing");
  const [improveKey, setImproveKey] = useState(liveRuleKeys[0] ?? "");
  const [diffFrom, setDiffFrom] = useState(
    liveVersion ?? versions.at(-1) ?? 1,
  );
  const [diffTo, setDiffTo] = useState(versions[0] ?? 1);
  const [candidateVersion, setCandidateVersion] = useState(
    versions.find((version) => version !== liveVersion) ?? versions[0] ?? 1,
  );

  function run(fn: () => Promise<unknown>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("common.operationFailed"));
      }
    });
  }

  const selectClass =
    "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-6">
      {!aiConfigured && (
        <p className="panel border-l-4 border-l-amber-500 p-4 text-sm">
          {t("ai.geminiBanner")}
        </p>
      )}

      {error && (
        <p role="alert" className="panel border-l-4 border-l-red-500 p-4 text-sm">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("ai.analyzePublished")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("ai.analyzeDesc")}
            </p>
          </div>
          <Button
            type="button"
            disabled={pending}
            className="self-start"
            onClick={() => run(actions.analyze)}
          >
            {t("ai.analyze")}
          </Button>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("ai.explainDiffs")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("ai.explainDesc")}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("ai.from")}
              <select
                className={selectClass}
                value={diffFrom}
                onChange={(event) => setDiffFrom(Number(event.target.value))}
              >
                {versions.map((version) => (
                  <option key={version} value={version}>
                    v{version}
                    {version === liveVersion ? ` ${t("ai.live")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("ai.to")}
              <select
                className={selectClass}
                value={diffTo}
                onChange={(event) => setDiffTo(Number(event.target.value))}
              >
                {versions.map((version) => (
                  <option key={version} value={version}>
                    v{version}
                    {version === liveVersion ? ` ${t("ai.live")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !aiConfigured}
              onClick={() => run(() => actions.explainDiff(diffFrom, diffTo))}
            >
              {t("ai.explain")}
            </Button>
          </div>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("ai.generateFromText")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("ai.generateDesc")}
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t("ai.requirement")}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t("ai.generatePlaceholder")}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("ai.decisionType")}
              <select
                className={selectClass}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as DecisionType)
                }
              >
                {categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              disabled={pending || !aiConfigured || prompt.trim().length < 8}
              onClick={() => run(() => actions.propose(prompt.trim(), category))}
            >
              {t("ai.proposeRule")}
            </Button>
          </div>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("ai.simulateCandidate")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("ai.simulateDesc")}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("ai.candidateVersion")}
              <select
                className={selectClass}
                value={candidateVersion}
                onChange={(event) =>
                  setCandidateVersion(Number(event.target.value))
                }
              >
                {versions.map((version) => (
                  <option key={version} value={version}>
                    v{version}
                    {version === liveVersion ? ` ${t("ai.live")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              disabled={pending || candidateVersion === liveVersion}
              onClick={() => run(() => actions.simulateVersion(candidateVersion))}
            >
              {t("ai.simulate")}
            </Button>
          </div>
          {candidateVersion === liveVersion && (
            <p className="text-xs text-[var(--muted)]">
              {t("ai.liveReferenceHint")}
            </p>
          )}
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("ai.triageFraud")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("ai.triageDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !aiConfigured}
            className="self-start"
            onClick={() => run(actions.triageFraud)}
          >
            {t("ai.triage")}
          </Button>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("ai.proposeImprovement")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("ai.improveDesc")}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("ai.rule")}
              <select
                className={selectClass}
                value={improveKey}
                onChange={(event) => setImproveKey(event.target.value)}
              >
                {liveRuleKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !aiConfigured || !improveKey}
              onClick={() => run(() => actions.improve(improveKey))}
            >
              {t("ai.propose")}
            </Button>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-xs text-[var(--muted)]">{t("ai.suggestions")}</h2>
          <Badge tone="muted">{suggestions.length}</Badge>
          <span className="text-xs text-[var(--muted)]">{t("ai.draftNote")}</span>
        </div>

        {suggestions.length === 0 ? (
          <p className="panel p-6 text-sm text-[var(--muted)]">
            {t("ai.noSuggestionsHint")}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onSimulate={actions.simulate}
                onReview={actions.review}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
