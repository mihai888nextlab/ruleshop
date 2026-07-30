import { NextResponse } from "next/server";
import { orderListResponseSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, resolveApiIdentity } from "@/lib/api-identity";
import { orderInclude, orderToSummary } from "@/lib/checkout-service";
import { prisma } from "@/lib/prisma";
import { findStoreBySlug } from "@/lib/storefront-read";

/**
 * Order history for the signed-in customer, in this store only.
 *
 * The query is keyed on both the store and the authenticated user, so history
 * from another shop is not reachable even though the account is shared.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;

    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const identity = await resolveApiIdentity(request, store.id);
    if (identity.kind !== "user") {
      // Guests have no durable identity to list against; they look up a single
      // order by id and email instead.
      return apiError("Autentificare necesară", 401);
    }

    const orders = await prisma.order.findMany({
      where: { storeId: store.id, userId: identity.userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      orderListResponseSchema.parse({
        orders: orders.map(orderToSummary),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
