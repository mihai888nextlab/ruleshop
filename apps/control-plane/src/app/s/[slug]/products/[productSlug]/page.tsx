import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { customerContext, storeLoyaltyPoints } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { formatRon } from "@/lib/utils";
import { addToCart } from "@/app/actions/cart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DecisionPanel } from "@/components/decision-panel";
import { StorefrontChrome } from "@/components/storefront-chrome";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  // route will be products/[productSlug]
  const p = await params;
  const store = await getStoreBySlug(p.slug);
  if (!store) notFound();

  const product = await prisma.product.findFirst({
    where: { storeId: store.id, slug: p.productSlug },
  });
  if (!product) notFound();

  const session = await auth();
  const guestId = await getOrCreateGuestId();
  const subjectKey = session?.user?.id
    ? `user:${session.user.id}`
    : `guest:${guestId}`;
  const loyaltyPoints = await storeLoyaltyPoints(store.id, session?.user?.id);
  const customer = customerContext(session, loyaltyPoints);
  const base = Number(product.basePrice.toString());

  const pricing = await runDecision({
    storeId: store.id,
    decisionType: "pricing",
    context: {
      store: { slug: store.slug },
      customer,
      product: {
        id: product.id,
        category: product.category,
        basePrice: base,
        stock: product.stock,
      },
    },
    subjectKey,
  });
  const availability = await runDecision({
    storeId: store.id,
    decisionType: "availability",
    context: {
      product: {
        id: product.id,
        stock: product.stock,
        category: product.category,
      },
      customer,
    },
    subjectKey,
  });
  const loyalty = await runDecision({
    storeId: store.id,
    decisionType: "loyalty",
    context: {
      customer,
      product: { category: product.category, basePrice: base },
      cart: { subtotal: base, itemCount: 1 },
    },
    subjectKey,
    persist: false,
  });

  const discount =
    typeof pricing.decision.discountPercent === "number"
      ? pricing.decision.discountPercent
      : 0;
  const final =
    typeof pricing.decision.fixedPrice === "number"
      ? pricing.decision.fixedPrice
      : base * (1 - discount / 100);
  const avail = availability.decision.availability as
    | { available: boolean; reason?: string }
    | undefined;
  const available = avail?.available !== false && product.stock > 0;

  async function addAction() {
    "use server";
    await addToCart(p.slug, product!.id, 1);
  }

  return (
    <StorefrontChrome store={{ id: store.id, slug: store.slug, name: store.name }}>
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <Badge tone="muted">{product.category}</Badge>
        <h1 className="font-semibold tracking-tight mt-2 text-4xl">{product.name}</h1>
        <p className="mt-3 text-[var(--muted)]">{product.description}</p>
        <div className="mt-6">
          {discount > 0 && (
            <p className="text-sm text-[var(--muted)] line-through">
              {formatRon(base)}
            </p>
          )}
          <p className="text-3xl font-semibold">{formatRon(final)}</p>
          {discount > 0 && <Badge tone="accent">-{discount}%</Badge>}
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Stoc: {product.stock}
          {!available && avail?.reason ? ` — ${avail.reason}` : ""}
        </p>
        {typeof loyalty.decision.loyaltyPoints === "number" && (
          <p className="mt-1 text-sm text-[var(--accent)]">
            Poți acumula ~{loyalty.decision.loyaltyPoints} puncte loialitate
          </p>
        )}
        <form action={addAction} className="mt-6">
          <Button type="submit" disabled={!available} size="lg">
            {available ? "Adaugă în coș" : "Indisponibil"}
          </Button>
        </form>
      </div>
      <div className="flex flex-col gap-4">
        <DecisionPanel
          title="Preț"
          matchedRules={pricing.matchedRules}
          rulesetVersion={pricing.rulesetVersion}
          explanation={pricing.explanation}
          decision={pricing.decision}
          warnings={pricing.warnings}
          isCanary={pricing.isCanary}
          traceId={pricing.traceId}
        />
        <DecisionPanel
          title="Disponibilitate"
          matchedRules={availability.matchedRules}
          rulesetVersion={availability.rulesetVersion}
          explanation={availability.explanation}
          decision={availability.decision}
          compact
        />
      </div>
    </div>
    </StorefrontChrome>
  );
}
