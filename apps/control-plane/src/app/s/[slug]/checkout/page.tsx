import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { cartSubtotal, getCartForStore } from "@/lib/cart";
import { customerContext, storeLoyaltyPoints } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { placeOrder } from "@/app/actions/checkout";
import { DecisionPanel } from "@/components/decision-panel";
import { CheckoutForm } from "@/components/checkout-form";
import { StorefrontChrome } from "@/components/storefront-chrome";
import { getTranslator } from "@/i18n/server";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslator();
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const cart = await getCartForStore(store.id);
  if (cart.items.length === 0) {
    return (
      <p>
        {t("storefront.cartEmpty")}{" "}
        <Link href={`/s/${slug}`} className="underline">
          {t("storefront.continueShopping")}
        </Link>
      </p>
    );
  }

  const session = await auth();
  const guestId = await getOrCreateGuestId();
  const subjectKey = session?.user?.id
    ? `user:${session.user.id}`
    : `guest:${guestId}`;
  const loyaltyPoints = await storeLoyaltyPoints(store.id, session?.user?.id);
  const customer = customerContext(session, loyaltyPoints);

  // Approximate priced subtotal
  let pricedSubtotal = 0;
  for (const item of cart.items) {
    const base = Number(item.product.basePrice.toString());
    const pricing = await runDecision({
      storeId: store.id,
      decisionType: "pricing",
      context: {
        store: { slug },
        customer,
        product: {
          id: item.product.id,
          category: item.product.category,
          basePrice: base,
          stock: item.product.stock,
        },
        cart: { itemCount: cart.items.length },
      },
      subjectKey,
      persist: false,
    });
    const discount =
      typeof pricing.decision.discountPercent === "number"
        ? pricing.decision.discountPercent
        : 0;
    const unit =
      typeof pricing.decision.fixedPrice === "number"
        ? pricing.decision.fixedPrice
        : base * (1 - discount / 100);
    pricedSubtotal += unit * item.quantity;
  }

  const shipping = await runDecision({
    storeId: store.id,
    decisionType: "shipping",
    context: {
      store: { slug },
      customer,
      cart: {
        subtotal: pricedSubtotal,
        itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
      },
    },
    subjectKey,
  });

  const options = (shipping.decision.shippingOptions as
    | { method: string; cost: number; label?: string }[]
    | undefined) ?? [
    { method: "standard", cost: 19, label: "Standard" },
  ];

  const fraudPreview = await runDecision({
    storeId: store.id,
    decisionType: "fraud",
    context: {
      store: { slug },
      customer,
      order: { total: pricedSubtotal + (options[0]?.cost ?? 0) },
      cart: { subtotal: pricedSubtotal },
    },
    subjectKey,
    persist: false,
  });

  const loyalty = await runDecision({
    storeId: store.id,
    decisionType: "loyalty",
    context: {
      customer,
      cart: { subtotal: pricedSubtotal },
    },
    subjectKey,
    persist: false,
  });

  return (
    <StorefrontChrome store={{ id: store.id, slug: store.slug, name: store.name }}>
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h1 className="font-semibold tracking-tight text-3xl">
          {t("storefront.checkout")}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Subtotal estimat: {formatRon(pricedSubtotal)} (față de baza{" "}
          {formatRon(cartSubtotal(cart.items))})
        </p>
        <CheckoutForm
          slug={slug}
          isGuest={!session?.user}
          shippingOptions={options}
          placeOrder={placeOrder}
        />
        {fraudPreview.decision.blocked === true && (
          <p className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            Atenție: antifraudă ar bloca această comandă —{" "}
            {String(fraudPreview.decision.blockReason)}
          </p>
        )}
        {typeof loyalty.decision.loyaltyPoints === "number" && (
          <p className="text-sm text-[var(--accent)]">
            {t("orders.loyaltyPoints", {
              points: loyalty.decision.loyaltyPoints,
            })}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <DecisionPanel
          title={t("storefront.shipping")}
          matchedRules={shipping.matchedRules}
          rulesetVersion={shipping.rulesetVersion}
          explanation={shipping.explanation}
          decision={shipping.decision}
          isCanary={shipping.isCanary}
          traceId={shipping.traceId}
        />
        <DecisionPanel
          title={t("storefront.fraudPreview")}
          matchedRules={fraudPreview.matchedRules}
          explanation={fraudPreview.explanation}
          decision={fraudPreview.decision}
          compact
        />
      </div>
    </div>
    </StorefrontChrome>
  );
}
