"use client";

import { useState, useTransition } from "react";
import type { DecisionType } from "@ruleshop/engine";
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

const CATEGORIES: { value: DecisionType; label: string }[] = [
  { value: "pricing", label: "Preț și reduceri" },
  { value: "shipping", label: "Livrare" },
  { value: "fraud", label: "Antifraudă" },
  { value: "availability", label: "Disponibilitate" },
  { value: "loyalty", label: "Loialitate" },
  { value: "theme", label: "Temă" },
];

export interface AiConsoleActions {
  analyze: () => Promise<unknown>;
  propose: (prompt: string, category: DecisionType) => Promise<unknown>;
  improve: (ruleKey: string) => Promise<unknown>;
  explainDiff: (from: number, to: number) => Promise<unknown>;
  simulate: (id: string) => Promise<unknown>;
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
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<DecisionType>("pricing");
  const [improveKey, setImproveKey] = useState(liveRuleKeys[0] ?? "");
  const [diffFrom, setDiffFrom] = useState(
    liveVersion ?? versions.at(-1) ?? 1,
  );
  const [diffTo, setDiffTo] = useState(versions[0] ?? 1);

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

  const selectClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-6">
      {!aiConfigured && (
        <p className="panel border-l-4 border-l-amber-500 p-4 text-sm">
          <strong>MOONSHOT_API_KEY nu este configurat.</strong> Analiza
          statistică, detectarea regulilor redundante și simularea pe istoric
          funcționează în continuare — sunt calculate de aplicație. Doar
          explicațiile în limbaj natural și generarea de reguli din text au nevoie
          de model.
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
            <h2 className="font-medium">Analizează versiunea publicată</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Caută reguli neutilizate, duplicate, contradictorii, umbrite de
              altele sau imposibil de îndeplinit — plus reguli care se potrivesc
              dar pierd mereu conflictul de prioritate, deci nu schimbă nimic.
            </p>
          </div>
          <Button
            type="button"
            disabled={pending}
            className="self-start"
            onClick={() => run(actions.analyze)}
          >
            Analizează
          </Button>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">Explică diferențele dintre versiuni</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Descrie în limbaj natural ce s-ar schimba pentru clienți dacă o
              versiune ar fi publicată.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              De la
              <select
                className={selectClass}
                value={diffFrom}
                onChange={(event) => setDiffFrom(Number(event.target.value))}
              >
                {versions.map((version) => (
                  <option key={version} value={version}>
                    v{version}
                    {version === liveVersion ? " (live)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              La
              <select
                className={selectClass}
                value={diffTo}
                onChange={(event) => setDiffTo(Number(event.target.value))}
              >
                {versions.map((version) => (
                  <option key={version} value={version}>
                    v{version}
                    {version === liveVersion ? " (live)" : ""}
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
              Explică
            </Button>
          </div>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">Generează o regulă din text</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Modelul primește schema magazinului, deci poate folosi doar câmpuri
              care există. Rezultatul este validat înainte de a ajunge la analiză.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Cerință
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="ex. clienții din Cluj abonați la newsletter primesc 15% la paltoane"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Tip de decizie
              <select
                className={selectClass}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as DecisionType)
                }
              >
                {CATEGORIES.map((option) => (
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
              Propune regula
            </Button>
          </div>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">Propune o îmbunătățire</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Pornește de la constatările aplicației pentru o regulă publicată,
              apoi simulează automat propunerea pe evaluările reale.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Regulă
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
              Propune
            </Button>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="eyebrow">Sugestii</h2>
          <Badge tone="muted">{suggestions.length}</Badge>
          <span className="text-xs text-[var(--muted)]">
            Aprobarea creează un draft — publicarea rămâne o acțiune umană
            separată.
          </span>
        </div>

        {suggestions.length === 0 ? (
          <p className="panel p-6 text-sm text-[var(--muted)]">
            Nicio sugestie încă. Începe cu „Analizează”, care funcționează și
            fără cheie de API.
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
