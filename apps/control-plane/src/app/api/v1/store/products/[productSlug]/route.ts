import { NextResponse } from "next/server";
import { productDetailResponseSchema } from "@ruleshop/contracts";
import { apiError, resolveApiIdentity } from "@/lib/api-identity";
import { handleCorsApiRoute } from "@/lib/cors";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";
import { buildProductDetail } from "@/lib/storefront-read";

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productSlug: string }> },
) {
  return handleCorsApiRoute(request, async () => {
    const { productSlug } = await params;
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

    const identity = await resolveApiIdentity(request, store.id);
    const detail = await buildProductDetail({ store, identity, productSlug });
    if (!detail) return apiError("Produs inexistent", 404);

    return NextResponse.json(productDetailResponseSchema.parse(detail), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
