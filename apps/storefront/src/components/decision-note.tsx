import type { DecisionMeta, ExplanationStep } from "@/lib/types";

function money(value: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(value);
}

export { money };

export function DecisionNote({
  decision,
  className = "",
}: {
  decision: DecisionMeta;
  className?: string;
}) {
  const hasRules = decision.matchedRules.length > 0;

  return (
    <p className={`text-xs text-[var(--muted)] ${className}`}>
      {hasRules ? (
        <>
          <span className="sr-only">Reguli aplicate: </span>
          {decision.matchedRules.join(" · ")}
        </>
      ) : (
        "preț de bază, nicio regulă aplicată"
      )}
      {decision.isCanary && (
        <span className="ml-1 font-medium text-[var(--warning)]">· canary</span>
      )}
    </p>
  );
}

export function DecisionTrace({
  title,
  decision,
  explanation,
  values,
}: {
  title: string;
  decision: DecisionMeta;
  explanation?: ExplanationStep[];
  values?: { label: string; value: string }[];
}) {
  const steps = explanation ?? decision.explanation ?? [];
  const matched = steps.filter((s) => s.matched);

  return (
    <details className="group border-t border-[var(--border)] py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-[var(--muted)]">
          {matched.length === 0
            ? "nicio regulă aplicată"
            : matched.length === 1
              ? "1 regulă aplicată"
              : `${matched.length} reguli aplicate`}
        </span>
        {decision.rulesetVersion != null && (
          <span className="text-xs text-[var(--muted)]">
            · set v{decision.rulesetVersion}
          </span>
        )}
        {decision.isCanary && (
          <span className="text-xs font-medium text-[var(--warning)]">
            · canary
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--muted)] group-open:hidden">
          arată detaliile
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 text-sm">
        {values && values.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            {values.map((entry) => (
              <div key={entry.label} className="flex gap-2">
                <dt className="text-[var(--muted)]">{entry.label}</dt>
                <dd className="font-medium">{entry.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {steps.length === 0 ? (
          <p className="text-[var(--muted)]">
            Nicio regulă nu a fost evaluată pentru această decizie.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {steps.map((step, index) => (
              <li key={`${step.ruleKey}-${index}`} className="flex gap-2">
                <span
                  aria-hidden
                  className={
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " +
                    (step.matched
                      ? "bg-[var(--positive)]"
                      : "bg-[var(--border)]")
                  }
                />
                <span>
                  <span className="font-medium">{step.ruleName}</span>{" "}
                  <span className="text-xs text-[var(--muted)]">
                    ({step.ruleKey})
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {step.reason}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {decision.warnings.length > 0 && (
          <ul className="flex flex-col gap-1 border-l-2 border-[var(--warning)] pl-3">
            {decision.warnings.map((warning, index) => (
              <li key={index} className="text-xs text-[var(--warning)]">
                {warning}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-[var(--muted)]">trace {decision.traceId}</p>
      </div>
    </details>
  );
}
