import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { cartSubtotal, getCartForStore } from "@/lib/cart";
import { customerContext } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { placeOrder } from "@/app/actions/checkout";
import { DecisionPanel } from "@/components/decision-panel";
import { CheckoutForm } from "@/components/checkout-form";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const cart = await getCartForStore(store.id);
  if (cart.items.length === 0) {
    return (
      <p>
        Coș gol.{" "}
        <Link href={`/s/${slug}`} className="underline">
          Înapoi la catalog
        </Link>
      </p>
    );
  }

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
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h1 className="display text-3xl">Checkout</h1>
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
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            Atenție: antifraudă ar bloca această comandă —{" "}
            {String(fraudPreview.decision.blockReason)}
          </p>
        )}
        {typeof loyalty.decision.loyaltyPoints === "number" && (
          <p className="text-sm text-[var(--accent)]">
            Vei primi {loyalty.decision.loyaltyPoints} puncte loialitate
          </p>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <DecisionPanel
          title="Livrare"
          matchedRules={shipping.matchedRules}
          rulesetVersion={shipping.rulesetVersion}
          explanation={shipping.explanation}
          decision={shipping.decision}
          isCanary={shipping.isCanary}
          traceId={shipping.traceId}
        />
        <DecisionPanel
          title="Antifraudă (previzualizare)"
          matchedRules={fraudPreview.matchedRules}
          explanation={fraudPreview.explanation}
          decision={fraudPreview.decision}
          compact
        />
      </div>
    </div>
  );
}
