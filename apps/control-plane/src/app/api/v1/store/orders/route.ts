import { NextResponse } from "next/server";
import { orderListResponseSchema } from "@ruleshop/contracts";
import { apiError, resolveApiIdentity } from "@/lib/api-identity";
import { orderInclude, orderToSummary } from "@/lib/checkout-service";
import { handleCorsApiRoute } from "@/lib/cors";
import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

    const identity = await resolveApiIdentity(request, store.id);
    if (identity.kind !== "user") {
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
