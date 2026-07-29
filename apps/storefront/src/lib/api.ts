import { cookies } from "next/headers";
import { z } from "zod";
import {
  apiErrorSchema,
  authResponseSchema,
  cartResponseSchema,
  catalogResponseSchema,
  checkoutResponseSchema,
  orderDetailResponseSchema,
  orderListResponseSchema,
  productDetailResponseSchema,
  profileResponseSchema,
  profileUpdateResponseSchema,
  storeListResponseSchema,
  type AuthResponse,
  type CartResponse,
  type CatalogResponse,
  type CheckoutResponse,
  type ProfileResponse,
  type StoreSummary,
} from "@ruleshop/contracts";

/**
 * The storefront's only door to data. Every read and write goes through the
 * control plane over HTTP: this app has no database driver and cannot evaluate
 * rules locally.
 *
 * Calls resolve to a tagged result instead of throwing. A shop that renders a
 * degraded page when the control plane is unreachable is worth more than one
 * that returns a 500, and it keeps error handling visible at each call site.
 */

export const SESSION_COOKIE = "rs_token";
export const GUEST_COOKIE = "rs_guest";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function controlPlaneUrl(): string {
  const url = process.env.CONTROL_PLANE_URL;
  if (!url) {
    throw new Error(
      "CONTROL_PLANE_URL lipsește. Vezi apps/storefront/.env.example.",
    );
  }
  return url.replace(/\/$/, "");
}

/** Identity headers: bearer token for members, stable guest id otherwise. */
async function identityHeaders(): Promise<Record<string, string>> {
  const jar = await cookies();
  const headers: Record<string, string> = {};

  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) headers.Authorization = `Bearer ${token}`;

  // Sent even when authenticated: it is what allows a guest cart to be merged
  // into the customer's on first sign-in.
  const guestId = jar.get(GUEST_COOKIE)?.value;
  if (guestId) headers["X-Guest-Id"] = guestId;

  return headers;
}

export async function apiFetch<T>(
  path: string,
  options: {
    schema: z.ZodType<T>;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    /** Opt into caching for genuinely static reads. Decisions must never cache. */
    revalidate?: number | false;
    /**
     * Statuses whose body should still be parsed with `schema` rather than
     * flattened into a message. Validation failures return 422 carrying
     * field-level errors, which a form needs in order to render them inline.
     */
    acceptStatuses?: number[];
  },
): Promise<ApiResult<T>> {
  const {
    schema,
    method = "GET",
    body,
    revalidate = false,
    acceptStatuses = [],
  } = options;

  let response: Response;
  try {
    response = await fetch(`${controlPlaneUrl()}${path}`, {
      method,
      headers: {
        ...(await identityHeaders()),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: revalidate === false ? "no-store" : undefined,
      next: revalidate === false ? undefined : { revalidate },
    });
  } catch (cause) {
    return {
      ok: false,
      status: 503,
      error:
        cause instanceof Error
          ? `Control plane inaccesibil: ${cause.message}`
          : "Control plane inaccesibil",
    };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    const parsed = apiErrorSchema.safeParse(payload);
    return {
      ok: false,
      status: response.status,
      error: parsed.success ? parsed.data.error : `Eroare HTTP ${response.status}`,
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // A shape mismatch means the two apps have drifted apart. Fail loudly here
    // rather than rendering undefined prices downstream.
    return {
      ok: false,
      status: 502,
      error: `Răspuns invalid de la control plane pentru ${path}`,
    };
  }

  return { ok: true, data: parsed.data };
}

const store = (slug: string) => `/api/v1/stores/${encodeURIComponent(slug)}`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listStores(): Promise<ApiResult<StoreSummary[]>> {
  const result = await apiFetch("/api/v1/stores", {
    schema: storeListResponseSchema,
    revalidate: 30,
  });
  return result.ok ? { ok: true, data: result.data.stores } : result;
}

export async function getCatalog(
  slug: string,
  filter: { q?: string; category?: string } = {},
): Promise<ApiResult<CatalogResponse>> {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.category) params.set("category", filter.category);
  const query = params.toString();

  return apiFetch(`${store(slug)}/products${query ? `?${query}` : ""}`, {
    schema: catalogResponseSchema,
  });
}

export async function getProduct(slug: string, productSlug: string) {
  return apiFetch(
    `${store(slug)}/products/${encodeURIComponent(productSlug)}`,
    { schema: productDetailResponseSchema },
  );
}

export async function getCart(slug: string): Promise<ApiResult<CartResponse>> {
  return apiFetch(`${store(slug)}/cart`, { schema: cartResponseSchema });
}

export async function getOrders(slug: string) {
  return apiFetch(`${store(slug)}/orders`, { schema: orderListResponseSchema });
}

export async function getOrder(
  slug: string,
  orderId: string,
  email?: string,
) {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  return apiFetch(
    `${store(slug)}/orders/${encodeURIComponent(orderId)}${query}`,
    { schema: orderDetailResponseSchema },
  );
}

export async function getProfile(
  slug: string,
): Promise<ApiResult<ProfileResponse>> {
  return apiFetch(`${store(slug)}/profile`, { schema: profileResponseSchema });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function setCartItem(
  slug: string,
  productSlug: string,
  quantity: number,
): Promise<ApiResult<CartResponse>> {
  return apiFetch(`${store(slug)}/cart`, {
    schema: cartResponseSchema,
    method: "PUT",
    body: { productSlug, quantity },
  });
}

export async function emptyCart(slug: string): Promise<ApiResult<CartResponse>> {
  return apiFetch(`${store(slug)}/cart`, {
    schema: cartResponseSchema,
    method: "DELETE",
  });
}

export async function checkout(
  slug: string,
  input: {
    shippingMethod: string;
    guestEmail?: string;
    idempotencyKey: string;
  },
): Promise<ApiResult<CheckoutResponse>> {
  return apiFetch(`${store(slug)}/checkout`, {
    schema: checkoutResponseSchema,
    method: "POST",
    body: input,
  });
}

export async function login(
  slug: string,
  email: string,
  password: string,
): Promise<ApiResult<AuthResponse>> {
  return apiFetch(`${store(slug)}/auth/login`, {
    schema: authResponseSchema,
    method: "POST",
    body: { email, password },
  });
}

export async function register(
  slug: string,
  input: { email: string; password: string; name?: string },
): Promise<ApiResult<AuthResponse>> {
  return apiFetch(`${store(slug)}/auth/register`, {
    schema: authResponseSchema,
    method: "POST",
    body: input,
  });
}

export async function saveProfile(
  slug: string,
  values: Record<string, unknown>,
) {
  return apiFetch(`${store(slug)}/profile`, {
    schema: profileUpdateResponseSchema,
    method: "PUT",
    body: { values },
    // 422 carries per-field messages the form renders next to each input.
    acceptStatuses: [422],
  });
}
