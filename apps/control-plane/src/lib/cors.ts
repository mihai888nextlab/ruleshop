import { NextResponse } from "next/server";
import { handleApiRoute } from "./api-identity";

/**
 * Browser storefront (Vite) calls the control plane from another origin.
 */

function allowedOrigin(requestOrigin: string | null): string {
  const configured =
    process.env.STOREFRONT_ORIGIN?.trim() || "http://localhost:3000";
  if (configured === "*") return requestOrigin ?? "*";
  if (requestOrigin && requestOrigin === configured) return requestOrigin;
  return configured;
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
