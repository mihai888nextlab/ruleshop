import { NextResponse } from "next/server";
import { handleApiRoute } from "./api-identity";

/**
 * Browser storefront (Vite) calls the control plane from another origin.
 *
 * `STOREFRONT_ORIGIN` is an allowlist, not a single value: one control plane
 * serves many tenants, and each shop is its own deployment on its own origin.
 * Separate entries with commas.
 *
 *   STOREFRONT_ORIGIN="http://localhost:3008,http://localhost:3009"
 *
 * Only one origin may be echoed per response, so the matching one is chosen per
 * request and `Vary: Origin` marks the response as origin-dependent — without it
 * a shared cache would hand shop B the header naming shop A.
 */

const DEFAULT_ORIGIN = "http://localhost:3008";

/** Trailing slashes and casing vary by client; an origin comparison must not. */
function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

function allowlist(): string[] {
  const configured = process.env.STOREFRONT_ORIGIN?.trim();
  if (!configured) return [DEFAULT_ORIGIN];

  const entries = configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : [DEFAULT_ORIGIN];
}

function allowedOrigin(requestOrigin: string | null): string {
  const allowed = allowlist();

  if (allowed.includes("*")) return requestOrigin ?? "*";

  if (requestOrigin) {
    const wanted = normalize(requestOrigin);
    // Echo the caller's own spelling, not the configured one: the browser
    // compares this header byte for byte against the origin it sent.
    if (allowed.some((entry) => normalize(entry) === wanted)) {
      return requestOrigin;
    }
  }

  // No match. Naming the first allowed origin is a deliberate refusal — the
  // browser will block the response, which is the correct outcome.
  return allowed[0]!;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request.headers.get("origin"));
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-RuleShop-Key, X-Guest-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function corsPreflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export function withCors(request: Request, response: NextResponse): NextResponse {
  const headers = corsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/** OPTIONS + CORS + safe error wrapping for key-scoped storefront routes. */
export async function handleCorsApiRoute(
  request: Request,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  if (request.method === "OPTIONS") return corsPreflight(request);
  return withCors(request, await handleApiRoute(fn));
}
