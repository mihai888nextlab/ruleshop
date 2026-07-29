import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCart } from "@/app/actions";
import { DecisionTrace, money } from "@/components/decision-note";
import { getProduct } from "@/lib/api";

/**
 * Product page.
 *
 * Shows the full evaluation trace for both pricing and availability. A shopper
 * rarely wants it, but the platform's claim is that every decision is
 * explainable, and a claim that is never surfaced is hard to trust.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const result = await getProduct(slug, productSlug);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Produsul nu poate fi afișat</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  const { product } = result.data;
  const saving = product.basePrice - product.finalPrice;

  return (
    <div className="flex flex-col gap-10">
      <Link
        href={`/s/${slug}`}
        className="text-sm text-[var(--muted)] hover:underline"
      >
        ← Catalog
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {product.category}
          </p>
          <h1 className="display mt-1 text-4xl sm:text-5xl">{product.name}</h1>
          <p className="mt-4 max-w-prose text-[var(--muted)]">
            {product.description}
          </p>
        </div>

        <aside className="flex flex-col gap-4 border-t border-[var(--border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <p className="display text-3xl">{money(product.finalPrice)}</p>

            {product.discountPercent > 0 && (
              <p className="mt-1 text-sm">
                <span className="text-[var(--muted)] line-through">
                  {money(product.basePrice)}
                </span>{" "}
                <span className="text-[var(--positive)]">
                  economisești {money(saving)} (
                  {Math.round(product.discountPercent)}%)
                </span>
              </p>
            )}
          </div>

          {product.available ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await addToCart(slug, product.slug, formData);
              }}
              className="flex flex-col gap-3"
            >
              <label className="flex items-center gap-2 text-sm">
                Cantitate
                {/* Exact stock is not published, so the input is generously
                    bounded and the control plane rejects a quantity it cannot
                    fill — which it has to do anyway, since stock can change
                    between this render and checkout. */}
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={1}
                  className="w-20 border-b border-[var(--border)] bg-transparent py-1 outline-none focus:border-[var(--accent)]"
                />
              </label>

              <button
                type="submit"
                className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-fg)]"
              >
                Adaugă în coș
              </button>

              {product.stockLevel === "low" && (
                <p className="text-xs text-[var(--warning)]">
                  Stoc limitat — se poate epuiza înainte de finalizare.
                </p>
              )}
            </form>
          ) : (
            <div>
              <p className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">
                Indisponibil
              </p>
              {product.availabilityReason && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {product.availabilityReason}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Cum au fost luate deciziile
        </h2>

        <div className="mt-2">
          <DecisionTrace
            title="Preț"
            decision={product.pricingDecision}
            values={[
              { label: "preț de bază", value: money(product.basePrice) },
              { label: "preț final", value: money(product.finalPrice) },
            ]}
          />
          <DecisionTrace
            title="Disponibilitate"
            decision={product.availabilityDecision}
            values={[
              {
                label: "rezultat",
                value: product.available ? "disponibil" : "indisponibil",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
