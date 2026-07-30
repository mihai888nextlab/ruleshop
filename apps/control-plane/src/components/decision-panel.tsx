"use client";

import { useT } from "@/components/i18n-provider";
import { Badge } from "./ui/badge";

type DecisionPanelProps = {
  title?: string;
  matchedRules?: string[];
  rulesetVersion?: number | null;
  explanation?: { ruleKey: string; matched: boolean; reason: string }[];
  decision?: Record<string, unknown>;
  warnings?: string[];
  isCanary?: boolean;
  traceId?: string;
  compact?: boolean;
};

export function DecisionPanel({
  title,
  matchedRules = [],
  rulesetVersion,
  explanation = [],
  decision,
  warnings = [],
  isCanary,
  traceId,
  compact,
}: DecisionPanelProps) {
  const t = useT();
  const panelTitle = title ?? t("decision.title");

  return (
    <aside
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
      aria-label={panelTitle}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-medium text-[var(--fg)]">{panelTitle}</p>
        {rulesetVersion != null && (
          <Badge tone="muted">
            {t("decision.versionBadge", { n: rulesetVersion })}
          </Badge>
        )}
        {isCanary && <Badge tone="warn">{t("evaluations.canary")}</Badge>}
        {traceId && <Badge tone="muted">{traceId}</Badge>}
      </div>
      {matchedRules.length > 0 ? (
        <p className="mb-2 text-[var(--muted)]">
          {t("decision.rules")}{" "}
          <span className="text-[var(--fg)]">{matchedRules.join(", ")}</span>
        </p>
      ) : (
        <p className="mb-2 text-[var(--muted)]">{t("decision.noneMatched")}</p>
      )}
      {decision && !compact && (
        <pre className="mb-2 overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-xs">
          {JSON.stringify(decision, null, 2)}
        </pre>
      )}
      {!compact && explanation.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {explanation
            .filter((e) => e.matched)
            .map((e) => (
              <li key={e.ruleKey}>
                <strong className="text-[var(--fg)]">{e.ruleKey}</strong>:{" "}
                {e.reason}
              </li>
            ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-800">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
