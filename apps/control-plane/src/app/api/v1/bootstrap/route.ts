import { NextResponse } from "next/server";
import { bootstrapResponseSchema } from "@ruleshop/contracts";
import { apiError } from "@/lib/api-identity";
import { handleCorsApiRoute } from "@/lib/cors";
import { guestFacts } from "@/lib/customer-facts";
import { runDecision } from "@/lib/decide";
import { rateLimit } from "@/lib/rate-limit";
import { resolveStoreFromApiKey } from "@/lib/store-api-key";
import { resolveTheme } from "@/lib/theme-service";

/**
 * Storefront cold start: prove the API key, return store + theme.
 *
 * Theme comes from evaluate() (theme scope) with a guest subject — same path
 * the catalog shell uses — so a published setTheme rule is visible immediately.
 */

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const limited = rateLimit(`bootstrap:${ip}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return apiError("Prea multe cereri. Încearcă din nou.", 429);
    }

    const store = await resolveStoreFromApiKey(request);
    if (!store) {
      return apiError("Cheie magazin invalidă sau revocată", 401);
    }

    const customer = guestFacts();
    const theme = await runDecision({
      storeId: store.id,
      decisionType: "theme",
      context: { store: { slug: store.slug }, customer },
      subjectKey: "guest:bootstrap",
      persist: false,
    });

    const resolved = await resolveTheme(store.id, theme.decision.themeId);

    return NextResponse.json(
      bootstrapResponseSchema.parse({
        storeId: store.id,
        storeName: store.name,
        slug: store.slug,
        theme: {
          key: resolved.key,
          name: resolved.name,
          tokens: resolved.tokens,
          fallback: resolved.fallback,
        },
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
