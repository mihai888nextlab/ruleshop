import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DecisionNote, money } from "@/components/decision-note";
import { ProductImage } from "@/components/product-image";
import { controlPlaneOrigin, getCatalog } from "@/lib/api";
import { storeHeroCopy, storeKind } from "@/lib/store-kind";
import type { CatalogResponse } from "@/lib/types";
import { useRuleShop } from "@/sdk/RuleShopProvider";

function resolveHeroSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/uploads/")) {
    const origin = controlPlaneOrigin();
    return origin ? `${origin}${path}` : path;
  }
  return path;
}

export function CatalogPage() {
  const { store, theme } = useRuleShop();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getCatalog({ q, category });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setData(null);
        return;
      }
      setError(null);
      setData(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [q, category]);

  if (error) {
    return (
      <div className="mx-auto max-w-[1120px] px-5 py-16">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
          <h1 className="display text-2xl">Catalogul nu poate fi afișat</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !store) {
    return (
      <div className="mx-auto max-w-[1120px] px-5 py-16 text-sm text-[var(--muted)]">
        Se încarcă…
      </div>
    );
  }

  const { products, categories } = data;
  const hasFilter = Boolean(q || category);
  const showHero = !hasFilter;
  const featured = products.find((p) => p.available) ?? products[0];
  const kind = storeKind(store.slug, data.store.theme.themeId);
  const heroCopy = storeHeroCopy(kind);
  const themeHero = resolveHeroSrc(
    data.store.theme.resolved.tokens.heroImage ?? theme?.tokens.heroImage,
  );
  const heroImage = themeHero ?? heroCopy.heroImage;
  const onPhoto = Boolean(heroImage);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const query = String(form.get("q") ?? "").trim();
    if (query) next.set("q", query);
    if (category) next.set("category", category);
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col">
      {showHero && (
        <section
          className={`hero ${onPhoto ? "" : "hero-mineral text-[var(--fg)]"}`}
        >
          {heroImage ? (
            <>
              <div className="hero-media">
                <img
                  src={heroImage}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="hero-shade" aria-hidden />
            </>
          ) : null}

          <div className="hero-copy">
            <p className={`eyebrow reveal ${onPhoto ? "text-white/70" : ""}`}>
              {heroCopy.eyebrow}
            </p>
            <h1
              className={`display reveal reveal-delay-1 mt-4 max-w-xl text-[clamp(3.4rem,10vw,7rem)] ${onPhoto ? "text-white" : ""}`}
            >
              {store.storeName}
            </h1>
            <p
              className={`reveal reveal-delay-2 mt-5 max-w-md text-base leading-relaxed sm:text-lg ${onPhoto ? "text-white/80" : "text-[var(--muted)]"}`}
            >
              {heroCopy.blurb}
            </p>
            <div className="reveal reveal-delay-3 mt-8 flex flex-wrap gap-3">
              <a
                href="#catalog"
                className={`btn ${onPhoto ? "btn-on-dark" : ""}`}
              >
                Explorează
              </a>
              {featured && (
                <Link
                  to={`/products/${featured.slug}`}
                  className={`btn ${onPhoto ? "btn-ghost-on-dark" : "btn-ghost"}`}
                >
                  {featured.name}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <div
        id="catalog"
        className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10"
      >
        <form
          onSubmit={onSearch}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
            Caută
            <input
              name="q"
              defaultValue={q ?? ""}
              className="field"
              placeholder="nume produs…"
            />
          </label>
          <button type="submit" className="btn">
            Filtrează
          </button>
          {hasFilter && (
            <Link to="/" className="btn btn-ghost">
              Resetează
            </Link>
          )}
        </form>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link
              to={q ? `/?q=${encodeURIComponent(q)}` : "/"}
              className={`text-sm ${!category ? "font-medium" : "text-[var(--muted)]"}`}
            >
              Toate
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat}
                to={`/?category=${encodeURIComponent(cat)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`text-sm ${category === cat ? "font-medium" : "text-[var(--muted)]"}`}
              >
                {cat}
              </Link>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Niciun produs găsit.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.slug} className="group">
                <Link to={`/products/${product.slug}`} className="block">
                  <ProductImage
                    imageUrl={product.imageUrl}
                    slug={product.slug}
                    alt={product.name}
                    className="w-full"
                  />
                  <div className="mt-3">
                    <p className="eyebrow">{product.category}</p>
                    <h2 className="display mt-1 text-xl">{product.name}</h2>
                    <p className="mt-2 text-sm font-medium">
                      {money(product.finalPrice)}
                      {product.discountPercent > 0 && (
                        <span className="ml-2 text-[var(--muted)] line-through">
                          {money(product.basePrice)}
                        </span>
                      )}
                    </p>
                    <DecisionNote
                      decision={product.pricingDecision}
                      className="mt-1"
                    />
                    {!product.available && (
                      <p className="mt-1 text-xs text-[var(--danger)]">
                        Indisponibil
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
