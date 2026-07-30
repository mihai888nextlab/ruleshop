import { NextResponse } from "next/server";
import {
  checkoutRequestSchema,
  checkoutResponseSchema,
} from "@ruleshop/contracts";
import { apiError, resolveApiIdentity } from "@/lib/api-identity";
import { resolveCart } from "@/lib/cart-service";
import { placeOrder } from "@/lib/checkout-service";
import { handleCorsApiRoute } from "@/lib/cors";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

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
