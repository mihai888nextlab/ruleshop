import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { DecisionTrace, money } from "@/components/decision-note";
import { ProductImage } from "@/components/product-image";
import { getProduct, setCartItem } from "@/lib/api";
import type { PricedProduct } from "@/lib/types";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function ProductPage() {
  const { productSlug = "" } = useParams();
  const { refreshCart } = useRuleShop();
  const [product, setProduct] = useState<PricedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getProduct(productSlug);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setProduct(null);
        return;
      }
      setError(null);
      setProduct(result.data.product);
    })();
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    setPending(true);
    setNotice(null);
    const quantity = Number(
      new FormData(event.currentTarget).get("quantity") ?? 1,
    );
    const result = await setCartItem(product.slug, quantity);
    setPending(false);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    await refreshCart();
    setNotice("Adăugat în coș.");
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1120px] px-5 py-16">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
          <h1 className="display text-2xl">Produsul nu poate fi afișat</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-[1120px] px-5 py-16 text-sm text-[var(--muted)]">
        Se încarcă…
      </div>
    );
  }

  const saving = product.basePrice - product.finalPrice;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-5 py-10">
      <Link
        to="/"
        className="text-sm text-[var(--muted)] transition-opacity hover:opacity-70"
      >
        ← Catalog
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-start">
        <ProductImage
          imageUrl={product.imageUrl}
          slug={product.slug}
          alt={product.name}
          className="w-full"
        />

        <aside className="flex flex-col gap-6 lg:pt-4">
          <div>
            <p className="eyebrow">{product.category}</p>
            <h1 className="display mt-3 text-[clamp(2.6rem,6vw,4.5rem)]">
              {product.name}
            </h1>
            <p className="mt-5 max-w-prose text-[var(--muted)] leading-relaxed">
              {product.description}
            </p>
          </div>

          <div className="border-y border-[var(--border)] py-5">
            <p className="display text-4xl">{money(product.finalPrice)}</p>

            {product.discountPercent > 0 && (
              <p className="mt-2 text-sm">
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
            <form onSubmit={onAdd} className="flex flex-col gap-4">
              <label className="flex items-center gap-3 text-sm">
                Cantitate
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={1}
                  className="field w-20 text-center"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="btn disabled:opacity-60"
              >
                {pending ? "Se adaugă…" : "Adaugă în coș"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-[var(--danger)]">
              {product.availabilityReason ?? "Indisponibil"}
            </p>
          )}

          {notice && (
            <p className="text-sm text-[var(--muted)]" role="status">
              {notice}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <DecisionTrace
              title="Preț"
              decision={product.pricingDecision}
              values={[
                { label: "bază", value: money(product.basePrice) },
                { label: "final", value: money(product.finalPrice) },
              ]}
            />
            <DecisionTrace
              title="Disponibilitate"
              decision={product.availabilityDecision}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
