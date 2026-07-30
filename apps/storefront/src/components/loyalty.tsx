import type { DecisionMeta, LoyaltyBalance } from "@/lib/types";

/**
 * Loyalty is a rule-driven decision like any other, so the shop shows both the
 * balance the engine reads and the points a published rule is about to grant.
 * Without this the whole `grantLoyalty` path is invisible: points land on the
 * membership at checkout and the customer never learns they exist.
 */

const TIER_LABEL: Record<LoyaltyBalance["tier"], string> = {
  guest: "Vizitator",
  standard: "Standard",
  vip: "VIP",
};

export function tierLabel(tier: LoyaltyBalance["tier"]): string {
  return TIER_LABEL[tier];
}

export function points(value: number): string {
  return `${value} ${value === 1 ? "punct" : "puncte"}`;
}

/** The customer's standing, for the account page. */
export function LoyaltyCard({ loyalty }: { loyalty: LoyaltyBalance }) {
  const toVip = Math.max(0, loyalty.vipThreshold - loyalty.points);
  const progress =
    loyalty.vipThreshold > 0
      ? Math.min(100, (loyalty.points / loyalty.vipThreshold) * 100)
      : 100;

  return (
    <section
      aria-labelledby="loyalty-heading"
      className="border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="loyalty-heading" className="text-sm text-[var(--muted)]">
          Puncte de loialitate
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide">
          {tierLabel(loyalty.tier)}
        </span>
      </div>

      <p className="display mt-1 text-3xl">{points(loyalty.points)}</p>

      {loyalty.tier === "vip" ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Ai statut VIP în acest magazin. Regulile care vizează clienții VIP se
          aplică automat comenzilor tale.
        </p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-valuenow={loyalty.points}
            aria-valuemin={0}
            aria-valuemax={loyalty.vipThreshold}
            aria-label="Progres către statutul VIP"
            className="mt-3 h-1.5 w-full bg-[var(--border)]"
          >
            <div
              className="h-full bg-[var(--positive)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Încă {points(toVip)} până la statutul VIP.
          </p>
        </>
      )}

      <p className="mt-3 text-xs text-[var(--muted)]">
        Punctele sunt specifice acestui magazin și se acordă la finalizarea
        comenzii, conform regulilor publicate.
      </p>
    </section>
  );
}

/**
 * What the current cart would grant, with the rules that decided it.
 *
 * Renders nothing when no rule grants any: a silent zero is the honest display
 * of "no loyalty rule matched", and inventing a line for it would suggest the
 * customer lost something.
 */
export function LoyaltyEarnNote({
  earned,
  decision,
  className = "",
}: {
  earned: number;
  decision?: DecisionMeta;
  className?: string;
}) {
  if (earned <= 0) return null;

  return (
    <p className={`text-sm text-[var(--positive)] ${className}`}>
      Vei primi {points(earned)} pentru această comandă.
      {decision && decision.matchedRules.length > 0 && (
        <span className="block text-xs text-[var(--muted)]">
          <span className="sr-only">Reguli aplicate: </span>
          {decision.matchedRules.join(" · ")}
          {decision.isCanary && (
            <span className="ml-1 font-medium text-[var(--warning)]">
              · canary
            </span>
          )}
        </span>
      )}
    </p>
  );
}
