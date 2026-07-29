import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const GUEST_COOKIE = "rs_guest";

/**
 * Issues a stable anonymous id.
 *
 * It identifies a guest's cart and is the value deterministic canary bucketing
 * hashes on, so a guest stays in the same cohort across page loads instead of
 * flickering between rulesets. It is also what lets a guest cart be folded into
 * a customer's cart when they sign in.
 *
 * Pattern matches what the control plane accepts, since anything else is
 * normalised away there.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(GUEST_COOKIE)?.value) {
    response.cookies.set(GUEST_COOKIE, `g_${crypto.randomUUID()}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

export const config = {
  // Exclude static assets: without a matcher this would run for every chunk and
  // image request too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
