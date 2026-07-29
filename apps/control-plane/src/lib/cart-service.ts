import type { Prisma } from "@prisma/client";
import type { CartResponse, CartLine } from "@ruleshop/contracts";
import type { ApiIdentity } from "./api-identity";
import { buildCustomerFacts, type CustomerFacts } from "./customer-facts";
import { runDecisionBatch, type DecisionOutcome } from "./decide";
import { prisma } from "./prisma";
import { roundMoney } from "./storefront-read";

/**
 * Cart reads and writes.
 *
 * Prices are never stored on the cart. Each read re-prices every line through
 * the engine, so publishing a rule changes what a customer already holding a
 * cart is quoted — which is the whole point of the platform, and also means a
 * stale cart can never lock in a price a rule no longer allows.
 */

const LOW_STOCK_CAP = 99;

export interface ResolvedCart {
  id: string;
  merged: boolean;
}

/**
 * Finds or creates the cart for this identity, folding in a guest cart when a
 * signed-in customer still presents the guest id they shopped under.
 *
 * Without this the guest cart was simply orphaned on login: the customer added
 * items, signed in, and silently got an empty cart.
 */
export async function resolveCart(
  storeId: string,
  identity: ApiIdentity,
  guestIdHint: string | null,
): Promise<ResolvedCart> {
  if (identity.kind === "guest") {
    const existing = await prisma.cart.findFirst({
      where: { storeId, guestId: identity.guestId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, merged: false };

    const created = await prisma.cart.create({
      data: { storeId, guestId: identity.guestId },
      select: { id: true },
    });
    return { id: created.id, merged: false };
  }

  const userCart =
    (await prisma.cart.findFirst({
      where: { storeId, userId: identity.userId },
      select: { id: true },
    })) ??
    (await prisma.cart.create({
      data: { storeId, userId: identity.userId },
      select: { id: true },
    }));

  if (!guestIdHint) return { id: userCart.id, merged: false };

  const guestCart = await prisma.cart.findFirst({
    where: { storeId, guestId: guestIdHint },
    include: { items: true },
  });
  if (!guestCart || guestCart.id === userCart.id || guestCart.items.length === 0) {
    // Nothing to fold in. Drop an empty guest cart so it does not linger.
    if (guestCart && guestCart.items.length === 0) {
      await prisma.cart.delete({ where: { id: guestCart.id } }).catch(() => {});
    }
    return { id: userCart.id, merged: false };
  }

  // Quantities add up rather than overwrite: the customer chose both sets.
  await prisma.$transaction(async (tx) => {
    for (const item of guestCart.items) {
      await tx.cartItem.upsert({
        where: {
          cartId_productId: { cartId: userCart.id, productId: item.productId },
        },
        create: {
          cartId: userCart.id,
          productId: item.productId,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
      });
    }
    await tx.cart.delete({ where: { id: guestCart.id } });
  });

  return { id: userCart.id, merged: true };
}

export async function setCartItem(
  storeId: string,
  cartId: string,
  productSlug: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const product = await prisma.product.findUnique({
    where: { storeId_slug: { storeId, slug: productSlug } },
    select: { id: true, active: true, stock: true, name: true },
  });

  if (!product || !product.active) {
    return { ok: false, error: "Produs inexistent", status: 404 };
  }

  if (quantity === 0) {
    await prisma.cartItem
      .delete({ where: { cartId_productId: { cartId, productId: product.id } } })
      .catch(() => {});
    return { ok: true };
  }

  // Advisory only: stock is re-checked atomically at checkout, since it can
  // change between adding to a cart and paying.
  if (quantity > product.stock) {
    return {
      ok: false,
      error: `Stoc insuficient pentru ${product.name}: ${product.stock} disponibile`,
      status: 409,
    };
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId, productId: product.id } },
    create: { cartId, productId: product.id, quantity },
    update: { quantity },
  });

  return { ok: true };
}

export async function clearCart(cartId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { cartId } });
}

export interface CartPricing {
  lines: CartLine[];
  subtotal: number;
  discountTotal: number;
  customer: CustomerFacts;
  shipping: Omit<DecisionOutcome, "evaluationId">;
  fraud: Omit<DecisionOutcome, "evaluationId">;
  loyalty: Omit<DecisionOutcome, "evaluationId">;
}

function decisionMeta(outcome: Omit<DecisionOutcome, "evaluationId">) {
  return {
    rulesetVersion: outcome.rulesetVersion,
    matchedRules: outcome.matchedRules,
    traceId: outcome.traceId,
    isCanary: outcome.isCanary,
    warnings: outcome.warnings,
  };
}

/**
 * Prices a cart end to end: every line, then shipping, fraud and loyalty over
 * the resulting subtotal.
 *
 * Line pricing has to complete before the cart-level decisions run, because
 * those read `cart.subtotal` — a free-shipping threshold must see the discounted
 * total, not the catalogue one.
 */
export async function priceCart(input: {
  store: { id: string; slug: string; name: string };
  cartId: string;
  identity: ApiIdentity;
  persist?: boolean;
}): Promise<CartPricing> {
  const { store, cartId, identity } = input;

  const [items, customer] = await Promise.all([
    prisma.cartItem.findMany({
      where: { cartId },
      include: {
        product: {
          select: {
            slug: true,
            name: true,
            basePrice: true,
            category: true,
            stock: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    buildCustomerFacts(store.id, identity),
  ]);

  const lineItems = items.map((item) => ({
    key: `pricing:${item.product.slug}` as const,
    decisionType: "pricing" as const,
    context: {
      store: { slug: store.slug },
      customer,
      product: {
        slug: item.product.slug,
        category: item.product.category,
        basePrice: Number(item.product.basePrice.toString()),
        stock: item.product.stock,
        inStock: item.product.stock > 0,
      },
    },
  }));

  const { outcomes } = await runDecisionBatch({
    storeId: store.id,
    subjectKey: identity.subjectKey,
    items: lineItems,
    persist: input.persist ?? false,
  });

  const lines: CartLine[] = [];
  let subtotal = 0;
  let baseTotal = 0;

  for (const item of items) {
    const outcome = outcomes.get(`pricing:${item.product.slug}`);
    const basePrice = roundMoney(Number(item.product.basePrice.toString()));
    const decision = outcome?.decision ?? {};

    const fixed = decision.fixedPrice;
    const percentRaw = decision.discountPercent;
    const percent =
      typeof percentRaw === "number" && Number.isFinite(percentRaw)
        ? Math.min(100, Math.max(0, percentRaw))
        : 0;

    const unitPrice =
      typeof fixed === "number" && Number.isFinite(fixed) && fixed >= 0
        ? roundMoney(fixed)
        : roundMoney(basePrice * (1 - percent / 100));

    const lineTotal = roundMoney(unitPrice * item.quantity);
    subtotal += lineTotal;
    baseTotal += roundMoney(basePrice * item.quantity);

    lines.push({
      productSlug: item.product.slug,
      name: item.product.name,
      quantity: item.quantity,
      unitBasePrice: basePrice,
      unitPrice,
      lineTotal,
      discountPercent:
        basePrice > 0
          ? roundMoney(Math.max(0, ((basePrice - unitPrice) / basePrice) * 100))
          : 0,
      availableStock: Math.min(item.product.stock, LOW_STOCK_CAP),
      pricingDecision: decisionMeta(
        outcome ?? emptyOutcome(),
      ),
    });
  }

  subtotal = roundMoney(subtotal);
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  const cartContext = {
    store: { slug: store.slug },
    customer,
    cart: { subtotal, itemCount },
  };

  const { outcomes: cartOutcomes } = await runDecisionBatch({
    storeId: store.id,
    subjectKey: identity.subjectKey,
    items: [
      { key: "shipping", decisionType: "shipping", context: cartContext },
      {
        key: "fraud",
        decisionType: "fraud",
        context: {
          ...cartContext,
          order: { total: subtotal, itemCount: items.length },
        },
      },
      {
        key: "loyalty",
        decisionType: "loyalty",
        context: {
          ...cartContext,
          order: { total: subtotal, itemCount: items.length },
        },
      },
    ],
    persist: input.persist ?? false,
  });

  return {
    lines,
    subtotal,
    discountTotal: roundMoney(Math.max(0, baseTotal - subtotal)),
    customer,
    shipping: cartOutcomes.get("shipping") ?? emptyOutcome(),
    fraud: cartOutcomes.get("fraud") ?? emptyOutcome(),
    loyalty: cartOutcomes.get("loyalty") ?? emptyOutcome(),
  };
}

function emptyOutcome(): Omit<DecisionOutcome, "evaluationId"> {
  return {
    decision: {},
    rulesetVersion: null,
    matchedRules: [],
    matchedRuleDetails: [],
    explanation: [],
    warnings: [],
    traceId: "eval-none",
    isCanary: false,
  };
}

/**
 * Shipping options offered to the customer.
 *
 * A rule may add options or impose a single one. When rules produce nothing, a
 * default keeps checkout completable rather than leaving the customer stuck with
 * an empty selector.
 */
export function shippingOptionsFrom(
  decision: Record<string, unknown>,
): { method: string; cost: number; label?: string }[] {
  const options: { method: string; cost: number; label?: string }[] = [];

  if (Array.isArray(decision.shippingOptions)) {
    for (const raw of decision.shippingOptions) {
      if (
        raw &&
        typeof raw === "object" &&
        typeof (raw as { method?: unknown }).method === "string" &&
        typeof (raw as { cost?: unknown }).cost === "number"
      ) {
        const option = raw as { method: string; cost: number; label?: string };
        options.push({
          method: option.method,
          cost: roundMoney(option.cost),
          label: option.label,
        });
      }
    }
  }

  const imposed = decision.shipping;
  if (
    imposed &&
    typeof imposed === "object" &&
    typeof (imposed as { method?: unknown }).method === "string" &&
    typeof (imposed as { cost?: unknown }).cost === "number"
  ) {
    const option = imposed as { method: string; cost: number };
    // An imposed method replaces the menu: the rule is stating the shipping,
    // not adding to a choice.
    return [{ method: option.method, cost: roundMoney(option.cost) }];
  }

  if (options.length === 0) {
    return [{ method: "standard", cost: 19, label: "Standard" }];
  }

  return options;
}

export function buildCartResponse(input: {
  storeContext: CartResponse["store"];
  pricing: CartPricing;
  merged: boolean;
}): CartResponse {
  const { pricing } = input;
  const options = shippingOptionsFrom(pricing.shipping.decision);

  const loyaltyPoints =
    typeof pricing.loyalty.decision.loyaltyPoints === "number"
      ? Math.round(pricing.loyalty.decision.loyaltyPoints)
      : 0;

  const blocked = pricing.fraud.decision.blocked === true;
  const blockedReason = blocked
    ? typeof pricing.fraud.decision.blockReason === "string"
      ? pricing.fraud.decision.blockReason
      : "Comandă blocată de regulile antifraudă"
    : null;

  return {
    store: input.storeContext,
    lines: pricing.lines,
    subtotal: pricing.subtotal,
    discountTotal: pricing.discountTotal,
    shippingOptions: options,
    shippingDecision: decisionMeta(pricing.shipping),
    loyalty: { points: loyaltyPoints, decision: decisionMeta(pricing.loyalty) },
    blockedReason,
    merged: input.merged,
  };
}

export function decimalToNumber(value: Prisma.Decimal): number {
  return roundMoney(Number(value.toString()));
}
