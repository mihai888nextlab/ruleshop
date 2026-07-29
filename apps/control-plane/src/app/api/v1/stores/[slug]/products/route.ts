import { NextResponse } from "next/server";
import { catalogQuerySchema, catalogResponseSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, resolveApiIdentity } from "@/lib/api-identity";
import { buildCatalog, findStoreBySlug } from "@/lib/storefront-read";

/**
 * Catalog for one store, with every price already decided by the rule engine.
 *
 * Scoping is by store slug and every query filters on the resolved storeId, so
 * there is no request shape that can read another store's products.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;

    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const url = new URL(request.url);
    const query = catalogQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    });
    if (!query.success) {
      return apiError("Parametri invalizi", 400, query.error.flatten());
    }

    const identity = await resolveApiIdentity(request);
    const catalog = await buildCatalog({
      store,
      identity,
      filter: query.data,
    });

    return NextResponse.json(catalogResponseSchema.parse(catalog), {
      // Decisions are per-subject and can change the moment a rule is
      // published, so catalog responses are never cached.
      headers: { "Cache-Control": "no-store" },
    });
  });
}
