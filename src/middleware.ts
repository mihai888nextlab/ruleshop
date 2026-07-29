import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const GUEST_COOKIE = "rs_guest";

export function middleware(request: NextRequest) {
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
