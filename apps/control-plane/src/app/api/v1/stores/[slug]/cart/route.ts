import { NextResponse } from "next/server";
import {
  cartItemRequestSchema,
  cartResponseSchema,
} from "@ruleshop/contracts";
import {
  apiError,
  handleApiRoute,
  resolveApiIdentity,
} from "@/lib/api-identity";
import {
  buildCartResponse,
  clearCart,
  priceCart,
  resolveCart,
  setCartItem,
} from "@/lib/cart-service";
import { buildCustomerFacts } from "@/lib/customer-facts";
import { runDecision } from "@/lib/decide";
import { findStoreBySlug } from "@/lib/storefront-read";
import { resolveTheme } from "@/lib/theme-service";

/**
 * The customer's cart for one store.
 *
 * Every read re-prices the cart through the engine rather than returning stored
 * totals, so a rule published a moment ago is reflected immediately and a stale
 * cart cannot preserve a price the rules no longer permit.
 */

type StoreRow = { id: string; slug: string; name: string };
type Identity = Awaited<ReturnType<typeof resolveApiIdentity>>;

type LoadedCart =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      store: StoreRow;
      identity: Identity;
      cart: { id: string; merged: boolean };
    };

async function loadCart(request: Request, slug: string): Promise<LoadedCart> {
  const store = await findStoreBySlug(slug);
  if (!store) {
    return { ok: false, response: apiError("Magazin inexistent", 404) };
  }

  const identity = await resolveApiIdentity(request, store.id);
  // A signed-in customer may still be carrying the guest id they shopped under,
  // which is what lets the two carts be merged.
  const guestIdHint = request.headers.get("x-guest-id");

  const cart = await resolveCart(store.id, identity, guestIdHint);
  return { ok: true, store, identity, cart };
}

async function respondWithCart(
  store: StoreRow,
  identity: Identity,
  cart: { id: string; merged: boolean },
) {
  const pricing = await priceCart({ store, cartId: cart.id, identity });

  // The theme decision travels with every storefront read so the shell can
  // restyle without a second round trip.
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const loaded = await loadCart(request, slug);
    if (!loaded.ok) return loaded.response;
    return respondWithCart(loaded.store, loaded.identity, loaded.cart);
  });
}

/** Sets an absolute quantity for one product. Quantity 0 removes the line. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;

    const body: unknown = await request.json().catch(() => null);
    const parsed = cartItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Date invalide", 400, parsed.error.flatten());
    }

    const loaded = await loadCart(request, slug);
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const loaded = await loadCart(request, slug);
    if (!loaded.ok) return loaded.response;

    await clearCart(loaded.cart.id);
    return respondWithCart(loaded.store, loaded.identity, loaded.cart);
  });
}
