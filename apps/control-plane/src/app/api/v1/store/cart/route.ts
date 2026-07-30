import { NextResponse } from "next/server";
import {
  cartItemRequestSchema,
  cartResponseSchema,
} from "@ruleshop/contracts";
import { apiError, resolveApiIdentity } from "@/lib/api-identity";
import {
  buildCartResponse,
  clearCart,
  priceCart,
  resolveCart,
  setCartItem,
} from "@/lib/cart-service";
import { handleCorsApiRoute } from "@/lib/cors";
import { buildCustomerFacts } from "@/lib/customer-facts";
import { runDecision } from "@/lib/decide";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";
import type { StoreFromApiKey } from "@/lib/store-api-key";
import { resolveTheme } from "@/lib/theme-service";

type Identity = Awaited<ReturnType<typeof resolveApiIdentity>>;

type LoadedCart =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      store: StoreFromApiKey;
      identity: Identity;
      cart: { id: string; merged: boolean };
    };

async function loadCart(request: Request): Promise<LoadedCart> {
  const store = await requireStoreApiKey(request);
  if (isErrorResponse(store)) {
    return { ok: false, response: store };
  }

  const identity = await resolveApiIdentity(request, store.id);
  const guestIdHint = request.headers.get("x-guest-id");
  const cart = await resolveCart(store.id, identity, guestIdHint);
  return { ok: true, store, identity, cart };
}

async function respondWithCart(
  store: StoreFromApiKey,
  identity: Identity,
  cart: { id: string; merged: boolean },
) {
  const pricing = await priceCart({ store, cartId: cart.id, identity });

  const customer = await buildCustomerFacts(store.id, identity);
  const theme = await runDecision({
    storeId: store.id,
    decisionType: "theme",
    context: { store: { slug: store.slug }, customer },
    subjectKey: identity.subjectKey,
    persist: false,
  });

  const resolvedTheme = await resolveTheme(store.id, theme.decision.themeId);

  const body = buildCartResponse({
    storeContext: {
      slug: store.slug,
      name: store.name,
      theme: {
        themeId:
          typeof theme.decision.themeId === "string"
            ? theme.decision.themeId
            : "default",
        resolved: resolvedTheme,
        decision: {
          rulesetVersion: theme.rulesetVersion,
          matchedRules: theme.matchedRules,
          traceId: theme.traceId,
          isCanary: theme.isCanary,
          warnings: theme.warnings,
        },
      },
    },
    pricing,
    merged: cart.merged,
    identity,
  });

  return NextResponse.json(cartResponseSchema.parse(body), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const loaded = await loadCart(request);
    if (!loaded.ok) return loaded.response;
    return respondWithCart(loaded.store, loaded.identity, loaded.cart);
  });
}

export async function PUT(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const body: unknown = await request.json().catch(() => null);
    const parsed = cartItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Date invalide", 400, parsed.error.flatten());
    }

    const loaded = await loadCart(request);
    if (!loaded.ok) return loaded.response;

    const result = await setCartItem(
      loaded.store.id,
      loaded.cart.id,
      parsed.data.productSlug,
      parsed.data.quantity,
    );
    if (!result.ok) return apiError(result.error, result.status);

    return respondWithCart(loaded.store, loaded.identity, loaded.cart);
  });
}

export async function DELETE(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const loaded = await loadCart(request);
    if (!loaded.ok) return loaded.response;

    await clearCart(loaded.cart.id);
    return respondWithCart(loaded.store, loaded.identity, loaded.cart);
  });
}
