import type { FraudClass } from "@/lib/ai";
import type { FraudStats } from "@/lib/fraud-analysis";
import { Badge } from "../ui/badge";

/**
 * Fraud triage, with the two halves kept apart.
 *
 * The statistics table is the shop's own data. The classification column is the
 * model's reading of it, and every row says which of the two it is — an operator
 * about to unblock a customer needs to know that "false positive" is a label
 * someone proposed, while "has 3 paid orders" is a fact.
 */

export interface FraudTriageView {
  stats: FraudStats;
  classifications: { orderId: string; classification: FraudClass; reason: string }[];
  recommendation: string | null;
  dropped: string[];
}

const CLASS_LABEL: Record<FraudClass, string> = {
  "likely-fraud": "probabil fraudă",
  "false-positive": "probabil fals pozitiv",
  "needs-review": "necesită analiză",
};

const CLASS_TONE: Record<FraudClass, "warn" | "ok" | "muted"> = {
  "likely-fraud": "warn",
  "false-positive": "ok",
  "needs-review": "muted",
};

function money(value: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(value);
}

export function FraudPanel({ view }: { view: FraudTriageView }) {
  const { stats } = view;
  const byOrder = new Map(
    view.classifications.map((row) => [row.orderId, row]),
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Calculat de aplicație · ultimele {stats.windowDays} zile
        </h3>

        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <Stat label="Comenzi" value={String(stats.checkouts)} />
          <Stat label="Plătite" value={String(stats.paid)} />
          <Stat
            label="Blocate"
            value={`${stats.blocked} (${(stats.blockRate * 100).toFixed(1)}%)`}
          />
          <Stat label="Valoare refuzată" value={money(stats.blockedValue)} />
          <Stat
            label="Blocate guest / cont"
            value={`${stats.guestBlocked} / ${stats.authenticatedBlocked}`}
          />
          <Stat
            label="Evaluări antifraudă"
            value={String(stats.fraudEvaluations)}
          />
        </dl>

        {stats.suspectedFalsePositives > 0 && (
          <p className="mt-2 text-sm text-[var(--warn)]">
            {stats.suspectedFalsePositives} dintre comenzile blocate aparțin unor
            clienți care au deja comenzi plătite în acest magazin.
          </p>
        )}

        {stats.repeatBlockedCustomers > 0 && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {stats.repeatBlockedCustomers} clienți au fost blocați de mai multe
            ori.
          </p>
        )}

        {stats.byRule.length > 0 && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Blocări pe regulă:{" "}
            {stats.byRule
              .map(
                (row) =>
                  `${row.key} ${row.blocked}× (${money(row.blockedValue)})`,
              )
              .join(" · ")}
          </p>
        )}

        <p className="mt-1 text-xs text-[var(--muted)]">
          Distribuția scorurilor de risc:{" "}
          {stats.scoreBuckets.map((b) => `${b.label}: ${b.count}`).join(" · ")}
        </p>
      </section>

      {stats.incidents.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-lg text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)]">
                <th className="py-1 pr-3 font-medium">Comandă</th>
                <th className="py-1 pr-3 font-medium">Valoare</th>
                <th className="py-1 pr-3 font-medium">Client</th>
                <th className="py-1 pr-3 font-medium">Istoric</th>
                <th className="py-1 pr-3 font-medium">Reguli</th>
                <th className="py-1 font-medium">Clasificare (model)</th>
              </tr>
            </thead>
            <tbody>
              {stats.incidents.map((incident) => {
                const verdict = byOrder.get(incident.orderId);

                return (
                  <tr
                    key={incident.orderId}
                    className="border-t border-[var(--border)] align-top"
                  >
                    <td className="py-1.5 pr-3">
                      <code className="text-xs">
                        {incident.orderId.slice(0, 8)}
                      </code>
                      <span className="block text-xs text-[var(--muted)]">
                        {new Date(incident.createdAt).toLocaleDateString("ro-RO")}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {money(incident.total)}
                    </td>
                    <td className="py-1.5 pr-3">
                      {incident.customer ?? "necunoscut"}
                      <span className="block text-xs text-[var(--muted)]">
                        {incident.authenticated ? "autentificat" : "guest"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-[var(--muted)]">
                      {incident.priorPaidOrders} plătite ·{" "}
                      {incident.priorBlockedOrders} blocate
                      {incident.suspectedFalsePositive && (
                        <Badge tone="warn" className="ml-1">
                          client plătitor
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {incident.matchedRules.join(", ") || "—"}
                    </td>
                    <td className="py-1.5">
                      {verdict ? (
                        <>
                          <Badge tone={CLASS_TONE[verdict.classification]}>
                            {CLASS_LABEL[verdict.classification]}
                          </Badge>
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            {verdict.reason}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">
                          neclasificată
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

      {view.recommendation && (
        <section className="rounded border border-dashed border-[var(--border)] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Recomandare generată de model
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {view.recommendation}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Nu modifică nicio regulă. Orice ajustare trece prin editor, validare și
            publicare manuală.
          </p>
        </section>
      )}

      {view.dropped.length > 0 && (
        <p className="rounded border border-[var(--warn)]/40 px-3 py-2 text-xs text-[var(--warn)]">
          Intrări respinse la validare: {view.dropped.join("; ")}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
