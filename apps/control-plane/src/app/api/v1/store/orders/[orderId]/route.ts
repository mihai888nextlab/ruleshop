import { NextResponse } from "next/server";
import {
  orderDecisionsSchema,
  orderDetailResponseSchema,
} from "@ruleshop/contracts";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  return handleCorsApiRoute(request, async () => {
    const { orderId } = await params;
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

    const identity = await resolveApiIdentity(request, store.id);
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
            : { id: "__unreachable__" }),
      },
      include: orderInclude,
    });

    if (!order) {
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
