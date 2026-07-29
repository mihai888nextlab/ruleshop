import Link from "next/link";
import { clearCart, updateCartItem } from "@/app/actions";
import { DecisionNote, DecisionTrace, money } from "@/components/decision-note";
import { getCart } from "@/lib/api";

/**
 * Cart.
 *
 * Re-priced on every load rather than showing stored totals, so a rule published
 * a moment ago is already reflected here. The shipping and loyalty decisions are
 * shown before checkout, since a free-shipping threshold or a points award is
 * exactly the kind of rule effect a shopper should see coming.
 */
export default async function CartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getCart(slug);

  if (!result.ok) {
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Coșul nu poate fi afișat</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  const cart = result.data;
  const cheapestShipping = cart.shippingOptions.reduce<number | null>(
    (min, option) => (min === null || option.cost < min ? option.cost : min),
    null,
  );
  const estimatedTotal = cart.subtotal + (cheapestShipping ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--border)] pb-4">
        <h1 className="display text-4xl">Coș</h1>
        {cart.lines.length > 0 && (
          <form
            action={async () => {
              "use server";
              await clearCart(slug);
            }}
          >
            <button
              type="submit"
              className="text-sm text-[var(--muted)] hover:underline"
            >
              Golește coșul
            </button>
          </form>
        )}
      </div>

      {cart.merged && (
        <p
          role="status"
          className="border-l-2 border-[var(--positive)] bg-[var(--surface-2)] px-4 py-2 text-sm"
        >
          Produsele adăugate înainte de autentificare au fost păstrate.
        </p>
      )}

      {cart.lines.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[var(--muted)]">Coșul este gol.</p>
          <Link
            href={`/s/${slug}`}
            className="mt-3 inline-block border border-[var(--accent)] px-4 py-2 text-sm"
          >
            Vezi catalogul
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex flex-col">
            {cart.lines.map((line) => (
              <li
                key={line.productSlug}
                className="flex flex-wrap items-start gap-4 border-b border-[var(--border)] py-5"
              >
                <div className="min-w-48 flex-1">
                  <Link
                    href={`/s/${slug}/products/${line.productSlug}`}
                    className="hover:underline"
                  >
                    <h2 className="display text-xl">{line.name}</h2>
                  </Link>

                  <p className="mt-1 text-sm">
                    {money(line.unitPrice)}
                    {line.discountPercent > 0 && (
                      <>
                        {" "}
                        <span className="text-[var(--muted)] line-through">
                          {money(line.unitBasePrice)}
                        </span>{" "}
                        <span className="text-[var(--positive)]">
                          −{Math.round(line.discountPercent)}%
                        </span>
                      </>
                    )}
                    <span className="text-[var(--muted)]"> / buc</span>
                  </p>

                  <DecisionNote
                    decision={line.pricingDecision}
                    className="mt-1"
                  />
                </div>

                {/* A form per quantity so the page works without client JS. */}
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    const next = Number(formData.get("quantity") ?? line.quantity);
                    await updateCartItem(
                      slug,
                      line.productSlug,
                      Number.isFinite(next) ? Math.max(0, next) : line.quantity,
                    );
                  }}
                  className="flex items-center gap-2"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Cantitate pentru {line.name}</span>
                    <input
                      name="quantity"
                      type="number"
                      min={0}
                      max={Math.max(1, line.availableStock)}
                      defaultValue={line.quantity}
                      className="w-16 border-b border-[var(--border)] bg-transparent py-1 text-center outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <button
                    type="submit"
                    className="border border-[var(--border)] px-2.5 py-1 text-xs hover:border-[var(--accent)]"
                  >
                    Actualizează
                  </button>
                </form>

                <div className="w-24 text-right">
                  <p>{money(line.lineTotal)}</p>
                </div>

                <form
                  action={async () => {
                    "use server";
                    await updateCartItem(slug, line.productSlug, 0);
                  }}
                >
                  <button
                    type="submit"
                    aria-label={`Elimină ${line.name}`}
                    className="text-sm text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                Decizii pentru acest coș
              </h2>
              <div className="mt-2">
                <DecisionTrace
                  title="Livrare"
                  decision={cart.shippingDecision}
                  values={cart.shippingOptions.map((option) => ({
                    label: option.label ?? option.method,
                    value: option.cost === 0 ? "gratuit" : money(option.cost),
                  }))}
                />
                <DecisionTrace
                  title="Loialitate"
                  decision={cart.loyalty.decision}
                  values={[
                    {
                      label: "puncte la finalizare",
                      value: String(cart.loyalty.points),
                    },
                  ]}
                />
              </div>
            </section>

            <aside className="border-t border-[var(--border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Subtotal</dt>
                  <dd>{money(cart.subtotal)}</dd>
                </div>
                {cart.discountTotal > 0 && (
                  <div className="flex justify-between text-[var(--positive)]">
                    <dt>Reduceri aplicate</dt>
                    <dd>−{money(cart.discountTotal)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Livrare (de la)</dt>
                  <dd>
                    {cheapestShipping === 0
                      ? "gratuit"
                      : money(cheapestShipping ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base">
                  <dt>Estimat</dt>
                  <dd className="font-medium">{money(estimatedTotal)}</dd>
                </div>
              </dl>

              {cart.blockedReason ? (
                <div className="mt-4 border border-[var(--danger)] p-3">
                  <p className="text-sm text-[var(--danger)]">
                    {cart.blockedReason}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    O regulă antifraudă blochează această comandă. Autentifică-te
                    sau reduce valoarea coșului.
                  </p>
                </div>
              ) : (
                <Link
                  href={`/s/${slug}/checkout`}
                  className="mt-4 block border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-center text-sm text-[var(--accent-fg)]"
                >
                  Continuă la finalizare
                </Link>
              )}

              {cart.loyalty.points > 0 && (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Vei primi {cart.loyalty.points} puncte de loialitate.
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
