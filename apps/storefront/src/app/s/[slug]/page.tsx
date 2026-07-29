import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionNote, money } from "@/components/decision-note";
import { getCatalog } from "@/lib/api";

/**
 * Catalog.
 *
 * Prices arrive already decided, each with the rules that produced it. Nothing
 * here computes a discount — that would both duplicate the engine and let the
 * displayed price drift from the one checkout charges.
 */
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { slug } = await params;
  const filter = await searchParams;

  const result = await getCatalog(slug, {
    q: filter.q,
    category: filter.category,
  });

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Catalogul nu poate fi afișat</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  const { store, products, categories } = result.data;
  const hasFilter = Boolean(filter.q || filter.category);

  return (
    <div className="flex flex-col gap-10">
      <section className="border-b border-[var(--border)] pb-8">
        <h1 className="display text-5xl sm:text-6xl">{store.name}</h1>
        <p className="mt-3 max-w-xl text-[var(--muted)]">
          Fiecare preț de mai jos este rezultatul unei evaluări de reguli, făcută
          pentru tine în momentul acestei cereri.
        </p>
      </section>

      <form
        action={`/s/${slug}`}
        className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] pb-6"
        role="search"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Caută</span>
          <input
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="nume sau descriere"
            className="min-w-40 border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Categorie</span>
          <select
            name="category"
            defaultValue={filter.category ?? ""}
            className="border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]"
          >
            <option value="">toate</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-1.5 text-sm text-[var(--accent-fg)]"
        >
          Filtrează
        </button>

        {hasFilter && (
          <Link
            href={`/s/${slug}`}
            className="py-1.5 text-sm text-[var(--muted)] hover:underline"
          >
            resetează
          </Link>
        )}
      </form>

      {products.length === 0 ? (
        <p className="py-12 text-center text-[var(--muted)]">
          Niciun produs nu corespunde căutării.
        </p>
      ) : (
        <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <li key={product.slug} className="flex flex-col">
              <Link
                href={`/s/${slug}/products/${product.slug}`}
                className="group flex flex-1 flex-col"
              >
                <h2 className="display text-2xl group-hover:underline">
                  {product.name}
                </h2>

                <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                  {product.category}
                </p>

                <p className="mt-2 line-clamp-2 flex-1 text-sm text-[var(--muted)]">
                  {product.description}
                </p>

                <div className="mt-4 flex items-baseline gap-3 border-t border-[var(--border)] pt-3">
                  <span className="text-lg">{money(product.finalPrice)}</span>

                  {product.discountPercent > 0 && (
                    <>
                      <span className="text-sm text-[var(--muted)] line-through">
                        {money(product.basePrice)}
                      </span>
                      <span className="text-sm text-[var(--positive)]">
                        −{Math.round(product.discountPercent)}%
                      </span>
                    </>
                  )}
                </div>
              </Link>

              <DecisionNote
                decision={product.pricingDecision}
                className="mt-1.5"
              />

              {!product.available && (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  Indisponibil
                  {product.availabilityReason
                    ? ` — ${product.availabilityReason}`
                    : ""}
                </p>
              )}
              {product.available && product.stockLevel === "low" && (
                <p className="mt-1 text-xs text-[var(--warning)]">
                  Stoc limitat
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
