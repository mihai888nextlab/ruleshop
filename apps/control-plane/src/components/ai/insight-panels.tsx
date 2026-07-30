import type {
  MetricDelta,
  RuleFinding,
  RuleImpact,
  SimulationResult,
} from "@ruleshop/engine";
import type { TrustAssessment } from "@/lib/ai-trust";
import { Badge } from "../ui/badge";

/**
 * The parts of the AI screens that show what the application measured.
 *
 * Deliberately server-renderable and free of interaction: these panels are used
 * both inside a suggestion and on the version page, where no model has been
 * called at all. That reuse is the point — the evidence is the same object
 * whether or not anyone asked for prose about it.
 */

const FINDING_LABEL: Record<RuleFinding["code"], string> = {
  unused: "neutilizată",
  "never-wins": "pierde mereu",
  "no-effect": "fără efect",
  duplicate: "duplicat",
  shadowed: "umbrită",
  contradictory: "contradictorie",
  unsatisfiable: "imposibilă",
  disabled: "dezactivată",
};

const VERDICT_LABEL: Record<RuleImpact["verdict"], string> = {
  "no-history": "fără istoric",
  disabled: "dezactivată",
  unused: "neutilizată",
  "no-effect": "fără efect",
  effective: "are efect",
};

function money(value: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(value);
}

export function FindingsList({ findings }: { findings: RuleFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Nicio problemă structurală găsită.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {findings.map((finding, index) => (
        <li key={`${finding.key}-${finding.code}-${index}`} className="text-sm">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={finding.severity === "warning" ? "warn" : "muted"}>
              {FINDING_LABEL[finding.code]}
            </Badge>
            <code className="text-xs">{finding.key}</code>
            {finding.relatedKey && (
              <span className="text-xs text-[var(--muted)]">
                vs <code>{finding.relatedKey}</code>
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[var(--muted)]">
            {finding.message}
          </span>
          {finding.detail && (
            <span className="block text-xs text-[var(--muted)]">
              {finding.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Per-rule contribution, measured by removing each rule and replaying.
 *
 * Revenue is shown from the shop's point of view: a rule that discounts appears
 * as a negative number, which is not a fault but the price of the campaign. The
 * table states that rather than colouring it red.
 */
export function ImpactTable({
  impacts,
  sampleSize,
}: {
  impacts: RuleImpact[];
  sampleSize: number;
}) {
  if (impacts.length === 0) return null;

  const ordered = [...impacts].sort(
    (a, b) =>
      b.decisionsChanged - a.decisionsChanged ||
      Math.abs(b.revenueDelta) - Math.abs(a.revenueDelta),
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Impact măsurat pe regulă
        </h3>
        <span className="text-xs text-[var(--muted)]">
          {sampleSize} contexte reluate, fiecare regulă scoasă pe rând
        </span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="py-1 pr-3 font-medium">Regulă</th>
              <th className="py-1 pr-3 font-medium">Potriviri</th>
              <th className="py-1 pr-3 font-medium">Decizii schimbate</th>
              <th className="py-1 pr-3 font-medium">Venit</th>
              <th className="py-1 pr-3 font-medium">Cost reduceri</th>
              <th className="py-1 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((impact) => (
              <tr key={impact.key} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-3">
                  <code className="text-xs">{impact.key}</code>
                </td>
                <td className="py-1.5 pr-3 tabular-nums text-[var(--muted)]">
                  {impact.matched}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {impact.decisionsChanged}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {impact.revenueDelta === 0 ? "—" : money(impact.revenueDelta)}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {impact.discountCostDelta === 0
                    ? "—"
                    : money(impact.discountCostDelta)}
                </td>
                <td className="py-1.5">
                  <Badge
                    tone={
                      impact.verdict === "effective"
                        ? "ok"
                        : impact.verdict === "no-effect"
                          ? "warn"
                          : "muted"
                    }
                  >
                    {VERDICT_LABEL[impact.verdict]}
                  </Badge>
                  {impact.blockedDelta !== 0 && (
                    <span className="ml-1 text-xs text-[var(--muted)]">
                      {impact.blockedDelta > 0 ? "+" : ""}
                      {impact.blockedDelta} blocări
                    </span>
                  )}
                  {impact.pointsDelta !== 0 && (
                    <span className="ml-1 text-xs text-[var(--muted)]">
                      {impact.pointsDelta > 0 ? "+" : ""}
                      {impact.pointsDelta} puncte
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        „Venit” negativ înseamnă că regula acordă reduceri — de obicei intenționat.
        „Fără efect” înseamnă că eliminarea regulii nu ar schimba nicio decizie din
        istoric.
      </p>
    </div>
  );
}

const LEVEL_LABEL: Record<TrustAssessment["level"], string> = {
  low: "încredere scăzută",
  medium: "încredere medie",
  high: "încredere ridicată",
};

/**
 * The platform's own assessment, with the checks behind it.
 *
 * A bare percentage invites the reader to trust the percentage. Listing which
 * checks were earned and which were not lets a reviewer disagree with the score,
 * which is the whole point of a human approval step.
 */
export function TrustPanel({ trust }: { trust: TrustAssessment }) {
  return (
    <section className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Nivel de încredere calculat de aplicație
        </h3>
        <Badge
          tone={
            trust.level === "high"
              ? "ok"
              : trust.level === "medium"
                ? "muted"
                : "warn"
          }
        >
          {(trust.score * 100).toFixed(0)}% · {LEVEL_LABEL[trust.level]}
        </Badge>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {trust.signals.map((signal) => (
          <li key={signal.id} className="flex gap-2 text-sm">
            <span
              aria-hidden
              className={
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " +
                (signal.earned >= 1
                  ? "bg-[var(--ok)]"
                  : signal.earned > 0
                    ? "bg-[var(--warn)]"
                    : "bg-[var(--border)]")
              }
            />
            <span>
              {signal.label}
              <span className="ml-1 text-xs text-[var(--muted)]">
                ({Math.round(signal.weight * 100)}%)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                {signal.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {trust.modelClaim !== null && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Modelul a declarat {(trust.modelClaim * 100).toFixed(0)}% încredere în
          propria propunere.{" "}
          {trust.claimOverstated ? (
            <strong className="text-[var(--warn)]">
              Mai mult decât susțin dovezile — tratează afirmația cu rezervă.
            </strong>
          ) : (
            "Este o afirmație despre sine, nu o dovadă, și nu intră în scorul de mai sus."
          )}
        </p>
      )}
    </section>
  );
}

const ADEQUACY_LABEL: Record<SimulationResult["sampleAdequacy"], string> = {
  insufficient: "eșantion prea mic pentru concluzii",
  indicative: "eșantion orientativ",
  reasonable: "eșantion rezonabil",
};

function formatMetric(value: number, format: MetricDelta["format"]): string {
  switch (format) {
    case "money":
      return money(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "rate":
      return `${(value * 100).toFixed(1)}%`;
    case "count":
      return String(value);
  }
}

/**
 * Candidate against current, on traffic that really happened.
 *
 * Rows with no change are hidden: a table of zeroes reads as a result when it is
 * only noise, and what a reviewer needs is the short list of things that move.
 */
export function SimulationTable({ simulation }: { simulation: SimulationResult }) {
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
