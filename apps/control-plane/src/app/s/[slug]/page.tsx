import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { customerContext, storeLoyaltyPoints } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { formatRon } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DecisionPanel } from "@/components/decision-panel";
import { StorefrontChrome } from "@/components/storefront-chrome";
import { getTranslator } from "@/i18n/server";

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslator();
  const sp = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const products = await prisma.product.findMany({
    where: {
      storeId: store.id,
      active: true,
      ...(sp.category ? { category: sp.category } : {}),
      ...(sp.q
        ? {
            OR: [
              { name: { contains: sp.q, mode: "insensitive" } },
              { description: { contains: sp.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  const categories = await prisma.product.findMany({
    where: { storeId: store.id, active: true },
    select: { category: true },
    distinct: ["category"],
  });

  const session = await auth();
  const guestId = await getOrCreateGuestId();
  const subjectKey = session?.user?.id
    ? `user:${session.user.id}`
    : `guest:${guestId}`;
  const loyaltyPoints = await storeLoyaltyPoints(store.id, session?.user?.id);
  const customer = customerContext(session, loyaltyPoints);

  const priced = await Promise.all(
    products.map(async (p) => {
      const base = Number(p.basePrice.toString());
      const pricing = await runDecision({
        storeId: store.id,
        decisionType: "pricing",
        context: {
          store: { slug: store.slug },
          customer,
          product: {
            id: p.id,
            category: p.category,
            basePrice: base,
            stock: p.stock,
          },
        },
        subjectKey,
        persist: true,
      });
      const availability = await runDecision({
        storeId: store.id,
        decisionType: "availability",
        context: {
          product: { id: p.id, stock: p.stock, category: p.category },
          customer,
        },
        subjectKey,
        persist: false,
      });
      const discount =
        typeof pricing.decision.discountPercent === "number"
          ? pricing.decision.discountPercent
          : 0;
      const fixed =
        typeof pricing.decision.fixedPrice === "number"
          ? pricing.decision.fixedPrice
          : null;
      const final = fixed ?? base * (1 - discount / 100);
      const avail = availability.decision.availability as
        | { available: boolean; reason?: string }
        | undefined;
      return {
        product: p,
        base,
        final,
        discount,
        pricing,
        available: avail?.available !== false && p.stock > 0,
        availReason: avail?.reason,
      };
    }),
  );

  return (
    <StorefrontChrome store={{ id: store.id, slug: store.slug, name: store.name }}>
    <div className="flex flex-col gap-8">
      <section className="border-b border-[var(--border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {store.name}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          {t("storefront.catalogIntro")}
        </p>
      </section>

      <form className="flex flex-wrap gap-3" action={`/s/${slug}`}>
        <input
          name="q"
          defaultValue={sp.q}
          placeholder={t("storefront.searchProducts")}
          className="min-w-[200px] flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue={sp.category ?? ""}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">{t("storefront.allCategories")}</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-fg)]"
        >
          {t("storefront.filter")}
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {priced.map(
          ({ product: p, base, final, discount, pricing, available }) => (
            <Link
              key={p.id}
              href={`/s/${slug}/products/${p.slug}`}
              className="flex flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold tracking-tight text-xl">{p.name}</h2>
                {!available && (
                  <Badge tone="warn">{t("storefront.unavailable")}</Badge>
                )}
              </div>
              <p className="line-clamp-2 text-sm text-[var(--muted)]">
                {p.description}
              </p>
              <div className="mt-auto flex items-end justify-between">
                <div>
                  {discount > 0 && (
                    <p className="text-xs text-[var(--muted)] line-through">
                      {formatRon(base)}
                    </p>
                  )}
                  <p className="text-lg font-semibold">{formatRon(final)}</p>
                </div>
                {discount > 0 && (
                  <Badge tone="accent">-{discount}%</Badge>
                )}
              </div>
              {pricing.matchedRules.length > 0 && (
                <p className="text-xs text-[var(--muted)]">
                  {t("storefront.rules")} {pricing.matchedRules.join(", ")}
                </p>
              )}
            </Link>
          ),
        )}
      </div>

      {priced[0] && (
        <DecisionPanel
          title={t("storefront.priceExample")}
          matchedRules={priced[0].pricing.matchedRules}
          rulesetVersion={priced[0].pricing.rulesetVersion}
          explanation={priced[0].pricing.explanation}
          decision={priced[0].pricing.decision}
          warnings={priced[0].pricing.warnings}
          isCanary={priced[0].pricing.isCanary}
          traceId={priced[0].pricing.traceId}
          compact
        />
      )}
    </div>
    </StorefrontChrome>
  );
}
