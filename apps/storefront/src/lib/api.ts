import {
  clearSession,
  getOrCreateGuestId,
  getSessionToken,
  setSessionToken,
} from "./session";
import { getRuntimeConfig } from "./runtime-config";
import type {
  AuthResponse,
  BootstrapResponse,
  CartResponse,
  CatalogResponse,
  CheckoutResponse,
  OrderDetailResponse,
  OrderListResponse,
  ProductDetailResponse,
  ProfileResponse,
  ProfileUpdateResponse,
} from "./types";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function apiUrl(): string {
  return getRuntimeConfig().apiUrl;
}

function apiKey(): string {
  return getRuntimeConfig().apiKey;
}

function identityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RuleShop-Key": apiKey(),
    "X-Guest-Id": getOrCreateGuestId(),
  };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    acceptStatuses?: number[];
  } = {},
): Promise<ApiResult<T>> {
  const { method = "GET", body, acceptStatuses = [] } = options;

  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method,
      headers: {
        ...identityHeaders(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
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
    const error =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Eroare HTTP ${response.status}`;
    return { ok: false, status: response.status, error };
  }

  return { ok: true, data: payload as T };
}

const store = "/api/v1/store";

export async function bootstrap(): Promise<ApiResult<BootstrapResponse>> {
  return apiFetch("/api/v1/bootstrap", {
    method: "GET",
  });
}

export async function getCatalog(
  filter: { q?: string; category?: string } = {},
): Promise<ApiResult<CatalogResponse>> {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.category) params.set("category", filter.category);
  const query = params.toString();
  return apiFetch(`${store}/products${query ? `?${query}` : ""}`);
}

export async function getProduct(productSlug: string) {
  return apiFetch<ProductDetailResponse>(
    `${store}/products/${encodeURIComponent(productSlug)}`,
  );
}

export async function getCart(): Promise<ApiResult<CartResponse>> {
  return apiFetch(`${store}/cart`);
}

export async function setCartItem(productSlug: string, quantity: number) {
  return apiFetch<CartResponse>(`${store}/cart`, {
    method: "PUT",
    body: { productSlug, quantity },
  });
}

export async function emptyCart() {
  return apiFetch<CartResponse>(`${store}/cart`, { method: "DELETE" });
}

export async function checkout(input: {
  shippingMethod: string;
  guestEmail?: string;
  idempotencyKey: string;
}) {
  return apiFetch<CheckoutResponse>(`${store}/checkout`, {
    method: "POST",
    body: input,
  });
}

export async function login(email: string, password: string) {
  const result = await apiFetch<AuthResponse>(`${store}/auth/login`, {
    method: "POST",
    body: { email, password },
  });
  if (result.ok) setSessionToken(result.data.token);
  return result;
}

export async function register(input: {
  email: string;
  password: string;
  name?: string;
}) {
  const result = await apiFetch<AuthResponse>(`${store}/auth/register`, {
    method: "POST",
    body: input,
  });
  if (result.ok) setSessionToken(result.data.token);
  return result;
}

export async function logout() {
  clearSession();
}

export async function getOrders() {
  return apiFetch<OrderListResponse>(`${store}/orders`);
}

export async function getOrder(orderId: string, email?: string) {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  return apiFetch<OrderDetailResponse>(
    `${store}/orders/${encodeURIComponent(orderId)}${query}`,
  );
}

export async function getProfile() {
  return apiFetch<ProfileResponse>(`${store}/profile`);
}

export async function saveProfile(values: Record<string, unknown>) {
  return apiFetch<ProfileUpdateResponse>(`${store}/profile`, {
    method: "PUT",
    body: { values },
    acceptStatuses: [422],
  });
}

export function controlPlaneOrigin(): string {
  try {
    return apiUrl();
  } catch {
    return "";
  }
}
