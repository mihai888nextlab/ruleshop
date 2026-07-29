import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { customerContext } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { formatRon } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DecisionPanel } from "@/components/decision-panel";

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { slug } = await params;
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
  let loyaltyPoints = 0;
  if (session?.user?.id) {
    loyaltyPoints =
      (
        await prisma.user.findUnique({ where: { id: session.user.id } })
      )?.loyaltyPoints ?? 0;
  }
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
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-[var(--hero)] px-6 py-10 text-[var(--accent-fg)]">
        <h1 className="display text-4xl sm:text-5xl">{store.name}</h1>
        <p className="mt-2 max-w-xl text-sm opacity-90">
          Prețurile și disponibilitatea sunt calculate de rule engine în timp
          real.
        </p>
      </section>

      <form className="flex flex-wrap gap-3" action={`/s/${slug}`}>
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Caută produse…"
          className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue={sp.category ?? ""}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">Toate categoriile</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-fg)]"
        >
          Filtrează
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {priced.map(
          ({ product: p, base, final, discount, pricing, available }) => (
            <Link
              key={p.id}
              href={`/s/${slug}/products/${p.slug}`}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="display text-xl">{p.name}</h2>
                {!available && <Badge tone="warn">Indisponibil</Badge>}
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
                  Reguli: {pricing.matchedRules.join(", ")}
                </p>
              )}
            </Link>
          ),
        )}
      </div>

      {priced[0] && (
        <DecisionPanel
          title="Exemplu decizie preț (primul produs)"
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
  );
}
