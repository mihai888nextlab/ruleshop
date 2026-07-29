import { cookies } from "next/headers";
import { z } from "zod";
import {
  apiErrorSchema,
  storeListResponseSchema,
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
      "CONTROL_PLANE_URL lipsește. Vezi .env.example din rădăcina proiectului.",
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

  const guestId = jar.get(GUEST_COOKIE)?.value;
  if (guestId) headers["X-Guest-Id"] = guestId;

  return headers;
}

export async function apiFetch<T>(
  path: string,
  options: {
    schema: z.ZodType<T>;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    /** Opt into caching for genuinely static reads. Decisions must never cache. */
    revalidate?: number | false;
  },
): Promise<ApiResult<T>> {
  const { schema, method = "GET", body, revalidate = false } = options;

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

  if (!response.ok) {
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

export async function listStores(): Promise<ApiResult<StoreSummary[]>> {
  const result = await apiFetch("/api/v1/stores", {
    schema: storeListResponseSchema,
    revalidate: 30,
  });
  return result.ok ? { ok: true, data: result.data.stores } : result;
}
