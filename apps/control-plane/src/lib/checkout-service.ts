import { Prisma } from "@prisma/client";
import type { OrderSummary } from "@ruleshop/contracts";
import type { ApiIdentity } from "./api-identity";
import { writeAudit } from "./audit";
import { priceCart, shippingOptionsFrom, type CartPricing } from "./cart-service";
import { prisma } from "./prisma";
import { roundMoney } from "./storefront-read";

/**
 * Order placement.
 *
 * Two properties matter more than anything else here, and both were previously
 * missing:
 *
 * 1. Stock cannot go negative. The old flow read stock, then decremented it
 *    unconditionally in a transaction — two concurrent orders for the last item
 *    both passed the check and both succeeded. Decrements are now conditional on
 *    sufficient stock, and a failed condition rolls the whole order back.
 *
 * 2. Placing an order twice is impossible. A double-submitted form, an impatient
 *    reload or a network retry all carry the same idempotency token, which is
 *    unique per store, so the second attempt returns the first order.
 */

export type CheckoutResult =
  | { ok: true; order: OrderSummary; replayed: boolean }
  | { ok: false; status: number; error: string; traceId?: string };

const orderInclude = {
  items: {
    select: { name: true, quantity: true, unitPrice: true, lineTotal: true },
  },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function toSummary(order: OrderRow): OrderSummary {
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    subtotal: roundMoney(Number(order.subtotal.toString())),
    discountTotal: roundMoney(Number(order.discountTotal.toString())),
    shippingCost: roundMoney(Number(order.shippingCost.toString())),
    shippingMethod: order.shippingMethod,
    total: roundMoney(Number(order.total.toString())),
    loyaltyPointsEarned: order.loyaltyPointsEarned,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: roundMoney(Number(item.unitPrice.toString())),
      lineTotal: roundMoney(Number(item.lineTotal.toString())),
    })),
  };
}

/** Thrown inside the transaction to signal a specific, reportable failure. */
class CheckoutFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function placeOrder(input: {
  store: { id: string; slug: string; name: string };
  cartId: string;
  identity: ApiIdentity;
  shippingMethod: string;
  guestEmail?: string;
  idempotencyKey: string;
}): Promise<CheckoutResult> {
  const { store, cartId, identity, idempotencyKey } = input;

  // Fast path for a retry we have already completed.
  const existing = await prisma.order.findUnique({
    where: {
      storeId_idempotencyKey: { storeId: store.id, idempotencyKey },
    },
    include: orderInclude,
  });
  if (existing) {
    return { ok: true, order: toSummary(existing), replayed: true };
  }

  const guestEmail =
    identity.kind === "user" ? null : (input.guestEmail?.trim() || null);
  if (identity.kind === "guest" && !guestEmail) {
    return {
      ok: false,
      status: 400,
      error: "Email necesar pentru comenzi în regim guest",
    };
  }

  // Persist these evaluations: an order's decisions belong in the history that
  // the audit view and the AI simulation replay.
  const pricing = await priceCart({
    store,
    cartId,
    identity,
    persist: true,
  });

  if (pricing.lines.length === 0) {
    return { ok: false, status: 400, error: "Coșul este gol" };
  }

  const options = shippingOptionsFrom(pricing.shipping.decision);
  const chosen = options.find((o) => o.method === input.shippingMethod);
  if (!chosen) {
    // The cost always comes from the rule-produced option, never from the
    // request, so a client cannot name its own shipping price.
    return {
      ok: false,
      status: 400,
      error: `Metoda de livrare "${input.shippingMethod}" nu este disponibilă`,
    };
  }

  const shippingCost = roundMoney(chosen.cost);
  const total = roundMoney(pricing.subtotal + shippingCost);

  const blocked = pricing.fraud.decision.blocked === true;
  const blockReason =
    typeof pricing.fraud.decision.blockReason === "string"
      ? pricing.fraud.decision.blockReason
      : "Comandă blocată de regulile antifraudă";

  const decisionTrace = {
    pricing: pricing.lines.map((line) => ({
      productSlug: line.productSlug,
      ...line.pricingDecision,
    })),
    shipping: metaOf(pricing.shipping),
    fraud: metaOf(pricing.fraud),
    loyalty: metaOf(pricing.loyalty),
  };

  /**
   * A blocked order is still recorded, with no stock movement and no points.
   * Discarding it would erase the fraud signal, and it also makes the outcome
   * idempotent: retrying the same token returns the same refusal.
   */
  if (blocked) {
    // Order items carry a real product reference, so the blocked attempt needs
    // the cart's product ids rather than just the priced lines.
    const cartItems = await prisma.cartItem.findMany({
      where: { cartId },
      include: { product: { select: { id: true, slug: true, name: true } } },
    });

    const blockedOrder = await prisma.order
      .create({
        data: {
          storeId: store.id,
          userId: identity.kind === "user" ? identity.userId : null,
          guestEmail,
          idempotencyKey,
          status: "BLOCKED",
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          shippingCost,
          shippingMethod: chosen.method,
          total,
          loyaltyPointsEarned: 0,
          decisionTrace: decisionTrace as object,
          items: {
            create: cartItems.map((item) => {
              const line = pricing.lines.find(
                (l) => l.productSlug === item.product.slug,
              );
              const unitPrice = line?.unitPrice ?? 0;
              return {
                productId: item.productId,
                name: item.product.name,
                quantity: item.quantity,
                unitPrice,
                lineTotal: roundMoney(unitPrice * item.quantity),
              };
            }),
          },
        },
        include: orderInclude,
      })
      .catch(async (cause) => {
        if (isUniqueViolation(cause)) return null;
        throw cause;
      });

    if (!blockedOrder) return replayOrFail(store.id, idempotencyKey);

    await writeAudit({
      storeId: store.id,
      userId: identity.kind === "user" ? identity.userId : undefined,
      action: "order.blocked",
      entity: "Order",
      entityId: blockedOrder.id,
      meta: {
        reason: blockReason,
        traceId: pricing.fraud.traceId,
        matchedRules: pricing.fraud.matchedRules,
      },
    });

    return {
      ok: false,
      status: 403,
      error: blockReason,
      traceId: pricing.fraud.traceId,
    };
  }

  const loyaltyPoints =
    typeof pricing.loyalty.decision.loyaltyPoints === "number"
      ? Math.max(0, Math.round(pricing.loyalty.decision.loyaltyPoints))
      : 0;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const items = await tx.cartItem.findMany({
        where: { cartId },
        include: { product: { select: { id: true, slug: true, name: true } } },
      });

      if (items.length === 0) {
        throw new CheckoutFailure(400, "Coșul este gol");
      }

      /**
       * The guard against overselling: decrement only where enough stock
       * remains. A concurrent order that took the last unit leaves this
       * matching zero rows, and the throw rolls back everything above.
       */
      for (const item of items) {
        const result = await tx.product.updateMany({
          where: {
            id: item.productId,
            storeId: store.id,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });

        if (result.count !== 1) {
          throw new CheckoutFailure(
            409,
            `Stoc insuficient pentru ${item.product.name}`,
          );
        }
      }

      const priceBySlug = new Map(
        pricing.lines.map((line) => [line.productSlug, line]),
      );

      const created = await tx.order.create({
        data: {
          storeId: store.id,
          userId: identity.kind === "user" ? identity.userId : null,
          guestEmail,
          idempotencyKey,
          status: "PAID",
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          shippingCost,
          shippingMethod: chosen.method,
          total,
          loyaltyPointsEarned: loyaltyPoints,
          decisionTrace: decisionTrace as object,
          items: {
            create: items.map((item) => {
              const line = priceBySlug.get(item.product.slug);
              const unitPrice = line?.unitPrice ?? 0;
              return {
                productId: item.productId,
                name: item.product.name,
                quantity: item.quantity,
                unitPrice,
                lineTotal: roundMoney(unitPrice * item.quantity),
              };
            }),
          },
        },
        include: orderInclude,
      });

      await tx.cartItem.deleteMany({ where: { cartId } });

      if (identity.kind === "user" && loyaltyPoints > 0) {
        await tx.membership.update({
          where: {
            storeId_userId: {
              storeId: store.id,
              userId: identity.userId,
            },
          },
          data: { loyaltyPoints: { increment: loyaltyPoints } },
        });
      }

      return created;
    });

    await writeAudit({
      storeId: store.id,
      userId: identity.kind === "user" ? identity.userId : undefined,
      action: "order.placed",
      entity: "Order",
      entityId: order.id,
      meta: {
        total,
        shippingMethod: chosen.method,
        loyaltyPoints,
        guest: identity.kind === "guest",
      },
    });

    return { ok: true, order: toSummary(order), replayed: false };
  } catch (cause) {
    if (cause instanceof CheckoutFailure) {
      return { ok: false, status: cause.status, error: cause.message };
    }
    // Two identical requests raced past the lookup above; the loser reports the
    // winner's order rather than an error.
    if (isUniqueViolation(cause)) {
      return replayOrFail(store.id, idempotencyKey);
    }
    throw cause;
  }
}

function metaOf(outcome: CartPricing["shipping"]) {
  return {
    rulesetVersion: outcome.rulesetVersion,
    matchedRules: outcome.matchedRules,
    traceId: outcome.traceId,
    isCanary: outcome.isCanary,
    warnings: outcome.warnings,
  };
}

function isUniqueViolation(cause: unknown): boolean {
  return (
    cause instanceof Prisma.PrismaClientKnownRequestError &&
    cause.code === "P2002"
  );
}

async function replayOrFail(
  storeId: string,
  idempotencyKey: string,
): Promise<CheckoutResult> {
  const winner = await prisma.order.findUnique({
    where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
    include: orderInclude,
  });

  if (winner) {
    return { ok: true, order: toSummary(winner), replayed: true };
  }

  return {
    ok: false,
    status: 409,
    error: "Comandă concurentă în procesare. Reîncearcă.",
  };
}

export { toSummary as orderToSummary, orderInclude };
