import { NextResponse } from "next/server";
import { catalogQuerySchema, catalogResponseSchema } from "@ruleshop/contracts";
import { apiError, resolveApiIdentity } from "@/lib/api-identity";
import { handleCorsApiRoute } from "@/lib/cors";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";
import { buildCatalog } from "@/lib/storefront-read";

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

    const url = new URL(request.url);
    const query = catalogQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    });
    if (!query.success) {
      return apiError("Parametri invalizi", 400, query.error.flatten());
    }

    const identity = await resolveApiIdentity(request, store.id);
    const catalog = await buildCatalog({
      store,
      identity,
      filter: query.data,
    });

    return NextResponse.json(catalogResponseSchema.parse(catalog), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
