import { NextResponse } from "next/server";
import { productDetailResponseSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, resolveApiIdentity } from "@/lib/api-identity";
import { buildProductDetail, findStoreBySlug } from "@/lib/storefront-read";

/**
 * Single product, including the full evaluation trace for both the pricing and
 * availability decisions so the product page can show why the price is what it
 * is rather than just asserting it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; productSlug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug, productSlug } = await params;

    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const identity = await resolveApiIdentity(request, store.id);
    const detail = await buildProductDetail({ store, identity, productSlug });
    if (!detail) return apiError("Produs inexistent", 404);

    return NextResponse.json(productDetailResponseSchema.parse(detail), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
