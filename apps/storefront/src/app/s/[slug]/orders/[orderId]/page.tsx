import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionTrace, money } from "@/components/decision-note";
import { getOrder } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "în așteptare",
  PAID: "plătită",
  SHIPPED: "expediată",
  CANCELLED: "anulată",
  BLOCKED: "blocată",
};

/**
 * Order confirmation and receipt.
 *
 * Shows the decisions recorded at checkout rather than re-evaluating them. Rules
 * change, and an order has to stay explainable by the rules that actually priced
 * it — re-running today's rules over an old order would produce a plausible but
 * false account.
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { slug, orderId } = await params;
  const { email } = await searchParams;

  const result = await getOrder(slug, orderId, email);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Comanda nu poate fi afișată</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  const { order, decisions } = result.data;
  const blocked = order.status === "BLOCKED";

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-[var(--border)] pb-4">
        <Link
          href={`/s/${slug}`}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          ← Catalog
        </Link>
        <h1 className="display mt-1 text-4xl">
          {blocked ? "Comandă blocată" : "Comandă confirmată"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {order.id} · {STATUS_LABELS[order.status] ?? order.status} ·{" "}
          {new Date(order.createdAt).toLocaleString("ro-RO")}
        </p>
      </div>

      {blocked && (
        <p className="border border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]">
          Această comandă a fost oprită de regulile antifraudă. Nu a fost
          procesată nicio plată și stocul nu a fost rezervat.
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
            Produse
          </h2>
          <ul className="mt-3 flex flex-col">
            {order.items.map((item, index) => (
              <li
                key={index}
                className="flex justify-between gap-4 border-b border-[var(--border)] py-3 text-sm"
              >
                <span>
                  {item.quantity} × {item.name}
                  <span className="block text-xs text-[var(--muted)]">
                    {money(item.unitPrice)} / buc
                  </span>
                </span>
                <span>{money(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
              Deciziile înregistrate la plasare
            </h2>
            <div className="mt-2">
              {decisions.shipping && (
                <DecisionTrace
                  title="Livrare"
                  decision={decisions.shipping}
                  values={[
                    {
                      label: "metodă",
                      value: order.shippingMethod ?? "—",
                    },
                    {
                      label: "cost",
                      value:
                        order.shippingCost === 0
                          ? "gratuit"
                          : money(order.shippingCost),
                    },
                  ]}
                />
              )}
              {decisions.fraud && (
                <DecisionTrace
                  title="Antifraudă"
                  decision={decisions.fraud}
                  values={[
                    { label: "rezultat", value: blocked ? "blocată" : "permisă" },
                  ]}
                />
              )}
              {decisions.loyalty && (
                <DecisionTrace
                  title="Loialitate"
                  decision={decisions.loyalty}
                  values={[
                    {
                      label: "puncte acordate",
                      value: String(order.loyaltyPointsEarned),
                    },
                  ]}
                />
              )}
              {decisions.pricing.length > 0 && (
                <DecisionTrace
                  title={`Preț (${decisions.pricing.length} ${
                    decisions.pricing.length === 1 ? "linie" : "linii"
                  })`}
                  decision={decisions.pricing[0]!}
                  values={[
                    { label: "subtotal", value: money(order.subtotal) },
                    {
                      label: "reduceri",
                      value: money(order.discountTotal),
                    },
                  ]}
                />
              )}
            </div>
          </div>
        </section>

        <aside className="border-t border-[var(--border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            {order.discountTotal > 0 && (
              <div className="flex justify-between text-[var(--positive)]">
                <dt>Reduceri</dt>
                <dd>−{money(order.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Livrare</dt>
              <dd>
                {order.shippingCost === 0
                  ? "gratuit"
                  : money(order.shippingCost)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base">
              <dt>Total</dt>
              <dd className="font-medium">{money(order.total)}</dd>
            </div>
          </dl>

          {order.loyaltyPointsEarned > 0 && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Ai primit {order.loyaltyPointsEarned} puncte de loialitate.
            </p>
          )}

          {email && (
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              Păstrează acest link pentru a revedea comanda. Ca oaspete, accesul
              se face cu emailul folosit la plasare.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
