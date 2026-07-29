import Link from "next/link";
import { redirect } from "next/navigation";
import { placeOrder } from "@/app/actions";
import { CheckoutForm } from "@/components/checkout-form";
import { DecisionTrace, money } from "@/components/decision-note";
import { getCart } from "@/lib/api";
import { hasSession } from "@/lib/session";

/**
 * Checkout.
 *
 * Guests and signed-in customers use the same page; the only difference is that
 * a guest supplies an email so the order stays reachable afterwards.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result, signedIn] = await Promise.all([getCart(slug), hasSession()]);

  if (!result.ok) {
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Finalizarea nu este disponibilă</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  const cart = result.data;
  if (cart.lines.length === 0) redirect(`/s/${slug}/cart`);

  // Re-checked here rather than trusted from the cart page: a rule may have been
  // published, or the cart changed, since that render.
  if (cart.blockedReason) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="display text-4xl">Finalizare</h1>
        <div className="border border-[var(--danger)] p-5">
          <p className="text-[var(--danger)]">{cart.blockedReason}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Comanda a fost oprită de o regulă antifraudă înainte de plasare.
          </p>
        </div>
        <Link
          href={`/s/${slug}/cart`}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          ← Înapoi la coș
        </Link>
      </div>
    );
  }

  const action = placeOrder.bind(null, slug);

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-[var(--border)] pb-4">
        <Link
          href={`/s/${slug}/cart`}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          ← Coș
        </Link>
        <h1 className="display mt-1 text-4xl">Finalizare</h1>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-8">
          <CheckoutForm
            action={action}
            shippingOptions={cart.shippingOptions}
            requiresEmail={!signedIn}
            formatMoney={money}
          />

          {!signedIn && (
            <p className="text-sm text-[var(--muted)]">
              Ai deja cont?{" "}
              <Link href={`/s/${slug}/login`} className="underline">
                Autentifică-te
              </Link>{" "}
              — coșul actual este păstrat, iar regulile pentru clienți
              înregistrați se pot aplica.
            </p>
          )}
        </div>

        <aside className="border-t border-[var(--border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
            Sumar
          </h2>

          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {cart.lines.map((line) => (
              <li key={line.productSlug} className="flex justify-between gap-3">
                <span className="text-[var(--muted)]">
                  {line.quantity} × {line.name}
                </span>
                <span>{money(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Subtotal</dt>
              <dd>{money(cart.subtotal)}</dd>
            </div>
            {cart.discountTotal > 0 && (
              <div className="flex justify-between text-[var(--positive)]">
                <dt>Reduceri</dt>
                <dd>−{money(cart.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Livrare</dt>
              <dd>se adaugă în funcție de opțiune</dd>
            </div>
          </dl>

          <div className="mt-4">
            <DecisionTrace
              title="Livrare"
              decision={cart.shippingDecision}
              values={cart.shippingOptions.map((option) => ({
                label: option.label ?? option.method,
                value: option.cost === 0 ? "gratuit" : money(option.cost),
              }))}
            />
            <DecisionTrace
              title="Verificare antifraudă"
              decision={cart.fraudDecision}
              values={[{ label: "rezultat", value: "comandă permisă" }]}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
