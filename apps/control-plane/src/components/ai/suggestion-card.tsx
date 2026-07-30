"use client";

import { useState, useTransition } from "react";
import type {
  RuleFinding,
  RuleUsage,
  SimulationResult,
  MetricDelta,
} from "@ruleshop/engine";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

/**
 * One AI suggestion, with its provenance and measured effect.
 *
 * The layout keeps two things visually apart on purpose: what the application
 * computed, and what the model said. A reviewer approving a change needs to know
 * which is which, because only one of them is evidence.
 */

export interface SuggestionView {
  id: string;
  kind: string;
  status: "pending" | "approved" | "rejected";
  prompt: string | null;
  createdAt: string;
  confidence: number | null;
  reviewNote: string | null;
  targetRuleKey: string | null;

  /** Model provenance, for traceability. */
  model: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  tokensPrompt: number | null;
  tokensOutput: number | null;
  rawResponse: string | null;

  narrative: string | null;
  narrativeError: string | null;
  reasoning: string | null;
  rule: unknown;
  before: unknown;
  findings: RuleFinding[];
  usage: RuleUsage | null;
  simulation: SimulationResult | null;
}

const KIND_LABEL: Record<string, string> = {
  analysis: "Analiză ruleset",
  nl_rule: "Regulă din limbaj natural",
  improvement: "Propunere de îmbunătățire",
  diff_explanation: "Explicație diferențe",
};

const ADEQUACY_LABEL: Record<SimulationResult["sampleAdequacy"], string> = {
  insufficient: "eșantion prea mic pentru concluzii",
  indicative: "eșantion orientativ",
  reasonable: "eșantion rezonabil",
};

function formatMetric(value: number, format: MetricDelta["format"]): string {
  switch (format) {
    case "money":
      return new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: "RON",
        maximumFractionDigits: 2,
      }).format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "rate":
      return `${(value * 100).toFixed(1)}%`;
    case "count":
      return String(value);
  }
}

export function SuggestionCard({
  suggestion,
  onSimulate,
  onReview,
}: {
  suggestion: SuggestionView;
  onSimulate: (id: string) => Promise<unknown>;
  onReview: (
    id: string,
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<unknown>;
}) {
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
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

  const hasRule = Boolean(suggestion.rule);

  return (
    <li className="panel flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">
          {KIND_LABEL[suggestion.kind] ?? suggestion.kind}
        </Badge>
        <Badge
          tone={
            suggestion.status === "approved"
              ? "ok"
              : suggestion.status === "rejected"
                ? "warn"
                : "muted"
          }
        >
          {suggestion.status}
        </Badge>
        {suggestion.targetRuleKey && (
          <Badge tone="muted">{suggestion.targetRuleKey}</Badge>
        )}
        <span className="ml-auto text-xs text-[var(--muted)]">
          {new Date(suggestion.createdAt).toLocaleString("ro-RO")}
        </span>
      </div>

      {suggestion.prompt && (
        <p className="text-sm">
          <span className="text-[var(--muted)]">Cerere: </span>
          {suggestion.prompt}
        </p>
      )}

      {/* Computed by this application. */}
      {(suggestion.findings.length > 0 || suggestion.usage) && (
        <section className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Calculat de aplicație
          </h3>

          {suggestion.usage && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {suggestion.usage.matched} potriviri · {suggestion.usage.won}{" "}
              câștigate
            </p>
          )}

          {suggestion.findings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {suggestion.findings.map((finding, index) => (
                <li key={index} className="text-sm">
                  <Badge
                    tone={finding.severity === "warning" ? "warn" : "muted"}
                  >
                    {finding.code}
                  </Badge>{" "}
                  <span className="text-[var(--muted)]">{finding.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {suggestion.simulation && (
        <SimulationTable simulation={suggestion.simulation} />
      )}

      {/* Produced by the model. Kept visually distinct from the above. */}
      {(suggestion.narrative || suggestion.reasoning) && (
        <section className="rounded border border-dashed border-[var(--border)] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Explicație generată de model
          </h3>
          {suggestion.narrative && (
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {suggestion.narrative}
            </p>
          )}
          {suggestion.reasoning && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
              {suggestion.reasoning}
            </p>
          )}
        </section>
      )}

      {suggestion.narrativeError && (
        <p className="rounded border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-sm">
          {suggestion.narrativeError}
        </p>
      )}

      {hasRule && (
        <details className="rounded border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-sm">
            Regula propusă (formă stocată)
          </summary>
          {suggestion.before ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--muted)]">înainte</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-[var(--surface-2)] p-2 text-xs">
                  {JSON.stringify(suggestion.before, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">propus</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-[var(--surface-2)] p-2 text-xs">
                  {JSON.stringify(suggestion.rule, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-[var(--surface-2)] p-2 text-xs">
              {JSON.stringify(suggestion.rule, null, 2)}
            </pre>
          )}
        </details>
      )}

      <Provenance suggestion={suggestion} />

      {suggestion.reviewNote && (
        <p className="text-sm text-[var(--muted)]">
          Notă de analiză: {suggestion.reviewNote}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {suggestion.status === "pending" ? (
        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          <p className="text-xs text-[var(--muted)]">
            Aprobarea creează un <strong>draft</strong>. Nicio regulă propusă de
            AI nu ajunge la clienți fără o publicare separată, făcută manual.
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Notă de analiză (opțional)"
            maxLength={500}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {hasRule && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => onSimulate(suggestion.id))}
              >
                Simulează pe istoric
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => onReview(suggestion.id, "approved", note || undefined))
              }
            >
              {hasRule ? "Aprobă → creează draft" : "Confirmă analiza"}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => onReview(suggestion.id, "rejected", note || undefined))
              }
            >
              Respinge
            </Button>
          </div>
        </div>
      ) : (
        <p className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
          {suggestion.status === "approved"
            ? "Aprobată. A produs cel mult un draft — publicarea rămâne o acțiune separată."
            : "Respinsă. Păstrată pentru trasabilitate."}
        </p>
      )}
    </li>
  );
}

function SimulationTable({ simulation }: { simulation: SimulationResult }) {
  const changes = simulation.deltas.filter((delta) => delta.delta !== 0);

  return (
    <section className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Simulare pe evenimente istorice
        </h3>
        <Badge
          tone={
            simulation.sampleAdequacy === "reasonable"
              ? "ok"
              : simulation.sampleAdequacy === "indicative"
                ? "muted"
                : "warn"
          }
        >
          {simulation.current.sampleSize} evaluări ·{" "}
          {ADEQUACY_LABEL[simulation.sampleAdequacy]}
        </Badge>
      </div>

      {changes.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Nicio diferență măsurabilă pe eșantionul disponibil.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-md text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)]">
                <th className="py-1 pr-3 font-medium">Metrică</th>
                <th className="py-1 pr-3 font-medium">Actual</th>
                <th className="py-1 pr-3 font-medium">Candidat</th>
                <th className="py-1 font-medium">Diferență</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((delta) => {
                // Only colour a change when the shop's preferred direction is
                // actually known; otherwise a neutral figure would be editorial.
                const good =
                  delta.higherIsBetter === null
                    ? null
                    : delta.higherIsBetter
                      ? delta.delta > 0
                      : delta.delta < 0;

                return (
                  <tr
                    key={delta.label}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="py-1.5 pr-3">{delta.label}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--muted)]">
                      {formatMetric(delta.before, delta.format)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {formatMetric(delta.after, delta.format)}
                    </td>
                    <td
                      className={
                        "py-1.5 tabular-nums " +
                        (good === null
                          ? ""
                          : good
                            ? "text-emerald-700"
                            : "text-red-700")
                      }
                    >
                      {delta.delta > 0 ? "+" : ""}
                      {formatMetric(delta.delta, delta.format)}
                      {delta.percentChange !== null && (
                        <span className="ml-1 text-xs text-[var(--muted)]">
                          ({delta.percentChange > 0 ? "+" : ""}
                          {delta.percentChange.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {simulation.ruleHitChanges.length > 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Potriviri modificate:{" "}
          {simulation.ruleHitChanges
            .slice(0, 6)
            .map((row) => `${row.key} ${row.before}→${row.after}`)
            .join(", ")}
        </p>
      )}

      <p className="mt-2 text-xs text-[var(--muted)]">
        Cifrele sunt calculate de aplicație prin reluarea contextelor reale, nu
        estimate de model. Măsoară efectul mecanic al regulilor pe trafic deja
        petrecut, nu o schimbare de comportament al clienților.
      </p>
    </section>
  );
}

function Provenance({ suggestion }: { suggestion: SuggestionView }) {
  const parts: string[] = [];
  if (suggestion.model) parts.push(`model ${suggestion.model}`);
  if (suggestion.promptVersion) parts.push(`prompt ${suggestion.promptVersion}`);
  if (suggestion.latencyMs != null) parts.push(`${suggestion.latencyMs} ms`);
  if (suggestion.tokensPrompt != null || suggestion.tokensOutput != null) {
    parts.push(
      `tokens ${suggestion.tokensPrompt ?? "?"}/${suggestion.tokensOutput ?? "?"}`,
    );
  }
  if (suggestion.confidence != null) {
    parts.push(`încredere declarată ${(suggestion.confidence * 100).toFixed(0)}%`);
  }

  if (parts.length === 0 && !suggestion.rawResponse) return null;

  return (
    <details className="text-xs text-[var(--muted)]">
      <summary className="cursor-pointer">
        Trasabilitate{parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
      </summary>
      {suggestion.rawResponse ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--surface-2)] p-2">
          {suggestion.rawResponse}
        </pre>
      ) : (
        <p className="mt-2">
          Fără răspuns de la model — rezultatul provine exclusiv din analiza
          aplicației.
        </p>
      )}
    </details>
  );
}
