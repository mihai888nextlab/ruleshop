import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const GUEST_COOKIE = "rs_guest";

/**
 * Control-plane requests are staff traffic, so the only thing handled here is
 * issuing a stable anonymous id. It is what deterministic canary bucketing
 * hashes on when a decision is requested without a logged-in user, which keeps
 * rule-editor previews in the same cohort across reloads.
 */
export function proxy(request: NextRequest) {
  const res = NextResponse.next();
  if (!request.cookies.get(GUEST_COOKIE)?.value) {
    res.cookies.set(GUEST_COOKIE, `g_${crypto.randomUUID()}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

export const config = {
  matcher: ["/s/:path*", "/api/decide"],
};
