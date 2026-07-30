import { NextResponse } from "next/server";
import {
  checkoutRequestSchema,
  checkoutResponseSchema,
} from "@ruleshop/contracts";
import { apiError, handleApiRoute, resolveApiIdentity } from "@/lib/api-identity";
import { resolveCart } from "@/lib/cart-service";
import { placeOrder } from "@/lib/checkout-service";
import { findStoreBySlug } from "@/lib/storefront-read";

/**
 * Places an order.
 *
 * The request carries only choices — a shipping method and, for guests, an email.
 * Every amount is derived server-side from the published rules, so a client
 * cannot submit its own prices. The idempotency token is required rather than
 * optional: without one, a retry after a timeout would place a second order and
 * the caller could not tell.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;

    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const body: unknown = await request.json().catch(() => null);
    const parsed = checkoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Date invalide", 400, parsed.error.flatten());
    }

    const identity = await resolveApiIdentity(request, store.id);
    const cart = await resolveCart(
      store.id,
      identity,
      request.headers.get("x-guest-id"),
    );

    const result = await placeOrder({
      store,
      cartId: cart.id,
      identity,
      shippingMethod: parsed.data.shippingMethod,
      guestEmail: parsed.data.guestEmail,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    if (!result.ok) {
      return apiError(
        result.error,
        result.status,
        result.traceId ? { traceId: result.traceId } : undefined,
      );
    }

    return NextResponse.json(
      checkoutResponseSchema.parse({
        order: result.order,
        replayed: result.replayed,
      }),
      { status: result.replayed ? 200 : 201 },
    );
  });
}
