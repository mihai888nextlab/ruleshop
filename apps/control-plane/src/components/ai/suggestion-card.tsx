"use client";

import { useState, useTransition } from "react";
import type {
  RuleFinding,
  RuleImpact,
  RuleUsage,
  SimulationResult,
  MetricDelta,
} from "@ruleshop/engine";
import type { TrustAssessment } from "@/lib/ai-trust";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { FraudPanel, type FraudTriageView } from "./fraud-panel";
import {
  FindingsList,
  ImpactTable,
  SimulationTable,
  TrustPanel,
} from "./insight-panels";

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

  /** Per-rule contribution, measured by leave-one-out replay. */
  impacts: RuleImpact[];
  replaySampleSize: number;
  /** The application's own assessment of how well evidenced this is. */
  trust: TrustAssessment | null;
  /** Fraud statistics plus the model's classification of each incident. */
  fraud: FraudTriageView | null;
  /** Which versions a simulation compared. */
  versions: { candidate: number; live: number | null } | null;
}

const KIND_LABEL: Record<string, string> = {
  analysis: "Analiză ruleset",
  nl_rule: "Regulă din limbaj natural",
  improvement: "Propunere de îmbunătățire",
  diff_explanation: "Explicație diferențe",
  version_simulation: "Simulare versiune candidat",
  fraud_triage: "Triaj incidente antifraudă",
};

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
        {suggestion.versions && (
          <Badge tone="muted">
            v{suggestion.versions.candidate} vs{" "}
            {suggestion.versions.live == null
              ? "nimic publicat"
              : `v${suggestion.versions.live}`}
          </Badge>
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
            <div className="mt-2">
              <FindingsList findings={suggestion.findings} />
            </div>
          )}
        </section>
      )}

      {suggestion.impacts.length > 0 && (
        <section className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <ImpactTable
            impacts={suggestion.impacts}
            sampleSize={suggestion.replaySampleSize}
          />
        </section>
      )}

      {suggestion.fraud && <FraudPanel view={suggestion.fraud} />}

      {suggestion.simulation && (
        <SimulationTable simulation={suggestion.simulation} />
      )}

      {suggestion.trust && <TrustPanel trust={suggestion.trust} />}

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
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
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
    // Computed by the application, not reported by the model — the model's own
    // claim is shown in the trust panel and labelled as a claim.
    parts.push(`încredere calculată ${(suggestion.confidence * 100).toFixed(0)}%`);
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
