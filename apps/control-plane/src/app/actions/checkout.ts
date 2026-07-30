"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { cartSubtotal, getCartForStore } from "@/lib/cart";
import { customerContext, storeLoyaltyPoints } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { getTranslator } from "@/i18n/server";

export async function placeOrder(
  slug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const t = await getTranslator();
  const store = await getStoreBySlug(slug);
  if (!store) return { error: t("errors.storeNotFound") };

  const session = await auth();
  const guestId = await getOrCreateGuestId();
  const subjectKey = session?.user?.id
    ? `user:${session.user.id}`
    : `guest:${guestId}`;

  const cart = await getCartForStore(store.id);
  if (cart.items.length === 0) return { error: t("errors.cartEmpty") };

  const loyaltyPoints = await storeLoyaltyPoints(store.id, session?.user?.id);
  const customer = customerContext(session, loyaltyPoints);

  // Price each line through engine
  let subtotal = 0;
  const lines: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[] = [];

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
    const lineTotal = unit * item.quantity;
    subtotal += lineTotal;
    lines.push({
      productId: item.productId,
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: unit,
      lineTotal,
    });
  }

  const shippingDecision = await runDecision({
    storeId: store.id,
    decisionType: "shipping",
    context: {
      store: { slug },
      customer,
      cart: {
        subtotal,
        itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
      },
    },
    subjectKey,
  });

  const method = String(formData.get("shippingMethod") || "standard");
  const options = (shippingDecision.decision.shippingOptions as
    | { method: string; cost: number; label?: string }[]
    | undefined) ?? [];
  const chosen =
    options.find((o) => o.method === method) ??
    (shippingDecision.decision.shipping as
      | { method: string; cost: number }
      | undefined) ??
    { method: "standard", cost: 19 };
  const shippingCost =
    typeof chosen.cost === "number" ? chosen.cost : Number(chosen.cost);

  const totalBefore = subtotal + shippingCost;

  const fraud = await runDecision({
    storeId: store.id,
    decisionType: "fraud",
    context: {
      store: { slug },
      customer,
      order: { total: totalBefore, itemCount: lines.length },
      cart: { subtotal },
    },
    subjectKey,
  });

  if (fraud.decision.blocked) {
    return {
      error:
        String(fraud.decision.blockReason || t("errors.fraudBlocked")) +
        ` [${fraud.traceId}]`,
    };
  }

  const loyalty = await runDecision({
    storeId: store.id,
    decisionType: "loyalty",
    context: {
      customer,
      cart: { subtotal },
      order: { total: totalBefore },
    },
    subjectKey,
  });
  const points =
    typeof loyalty.decision.loyaltyPoints === "number"
      ? loyalty.decision.loyaltyPoints
      : 0;

  const guestEmail = session?.user?.email
    ? null
    : String(formData.get("guestEmail") || "").trim() || null;

  if (!session?.user && !guestEmail) {
    return { error: t("errors.guestEmailRequired") };
  }

  // stock check
  for (const item of cart.items) {
    if (item.product.stock < item.quantity) {
      return {
        error: t("errors.insufficientStock", { name: item.product.name }),
      };
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    for (const item of cart.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
    const created = await tx.order.create({
      data: {
        storeId: store.id,
        userId: session?.user?.id,
        guestEmail,
        status: "PAID",
        subtotal,
        discountTotal: Math.max(0, cartSubtotal(cart.items) - subtotal),
        shippingCost,
        shippingMethod: chosen.method ?? method,
        total: totalBefore,
        loyaltyPointsEarned: points,
        decisionTrace: {
          shipping: shippingDecision,
          fraud,
          loyalty,
        } as object,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    if (session?.user?.id && points > 0) {
      await tx.membership.update({
        where: {
          storeId_userId: { storeId: store.id, userId: session.user.id },
        },
        data: { loyaltyPoints: { increment: points } },
      });
    }
    return created;
  });

  await writeAudit({
    storeId: store.id,
    userId: session?.user?.id,
    action: "order.placed",
    entity: "Order",
    entityId: order.id,
    meta: { total: totalBefore, shippingMethod: method },
  });

  redirect(`/s/${slug}/orders/${order.id}`);
}
