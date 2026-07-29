import { NextResponse } from "next/server";
import {
  orderDecisionsSchema,
  orderDetailResponseSchema,
} from "@ruleshop/contracts";
import { apiError, handleApiRoute, resolveApiIdentity } from "@/lib/api-identity";
import { orderInclude, orderToSummary } from "@/lib/checkout-service";
import { prisma } from "@/lib/prisma";
import { findStoreBySlug } from "@/lib/storefront-read";

/**
 * A single order, with the decisions that produced it.
 *
 * Guests can reach their own order by supplying the email they checked out with,
 * which is what makes a guest purchase inspectable after leaving the confirmation
 * page. It is a capability check, not an authentication one: knowing both an
 * unguessable order id and the email is the proof.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; orderId: string }> },
) {
  return handleApiRoute(async () => {
    const { slug, orderId } = await params;

    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const identity = await resolveApiIdentity(request);
    const email = new URL(request.url).searchParams
      .get("email")
      ?.trim()
      .toLowerCase();

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        storeId: store.id,
        ...(identity.kind === "user"
          ? { userId: identity.userId }
          : email
            ? { guestEmail: email }
            : // Neither a session nor an email: nothing is addressable.
              { id: "__unreachable__" }),
      },
      include: orderInclude,
    });

    if (!order) {
      // Same response whether the order does not exist or belongs to someone
      // else, so ids cannot be probed for existence.
      return apiError("Comandă inexistentă", 404);
    }

    const decisions = orderDecisionsSchema.safeParse(order.decisionTrace ?? {});

    return NextResponse.json(
      orderDetailResponseSchema.parse({
        order: orderToSummary(order),
        decisions: decisions.success
          ? decisions.data
          : { pricing: [], shipping: null, fraud: null, loyalty: null },
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
