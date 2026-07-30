import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "./prisma";

/**
 * Identity for the storefront-facing API.
 *
 * Customers authenticate with a bearer token rather than a cookie, because the
 * storefront runs on a different origin than the control plane and cross-site
 * credentialled cookies are both fragile and a CSRF liability. The storefront
 * holds the token server-side and never exposes it to the browser.
 *
 * Staff sessions are separate (Auth.js, see lib/auth.ts). A customer token is
 * signed with a different secret and is therefore useless against staff routes
 * even if one leaks.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  const raw = process.env.STOREFRONT_JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "STOREFRONT_JWT_SECRET lipsește sau este prea scurt (minim 16 caractere)",
    );
  }
  return new TextEncoder().encode(raw);
}

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
});

export async function signCustomerToken(user: {
  id: string;
  email: string;
}): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("ruleshop-control-plane")
    .setAudience("ruleshop-storefront")
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret());

  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

async function verifyCustomerToken(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "ruleshop-control-plane",
      audience: "ruleshop-storefront",
    });
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) return null;
    return { userId: parsed.data.sub, email: parsed.data.email };
  } catch {
    // Expired, tampered, or wrong secret. All are simply "not authenticated".
    return null;
  }
}

export type ApiIdentity =
  | { kind: "user"; userId: string; email: string; subjectKey: string }
  | { kind: "guest"; guestId: string; subjectKey: string };

/**
 * Guest ids come from an untrusted client, so they are normalised before use.
 * They feed the canary hash, and an unbounded value would let a caller both
 * bloat stored rows and fish for a bucket that lands in the canary cohort.
 * Shape is constrained; cohort shopping is inherent to anonymous traffic and is
 * accepted for guests, while logged-in users are bucketed on their user id.
 */
const GUEST_ID_PATTERN = /^g_[A-Za-z0-9_-]{8,64}$/;

function normaliseGuestId(raw: string | null): string {
  if (raw && GUEST_ID_PATTERN.test(raw)) return raw;
  return "g_anonymous";
}

export async function resolveApiIdentity(
  request: Request,
): Promise<ApiIdentity> {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (bearer) {
    const claims = await verifyCustomerToken(bearer);
    if (claims) {
      /**
       * A validly signed token can still name a subject that no longer exists —
       * the account was deleted, or the database was rebuilt while a browser kept
       * its cookie. Trusting the signature alone would hand every downstream
       * caller a userId that violates its foreign keys, which surfaces as an
       * opaque 500 rather than as "not signed in".
       *
       * One primary-key lookup per authenticated request is a fair price for
       * that, and it also means a deleted account's token stops working at once
       * instead of when it expires.
       */
      const subject = await prisma.user.findUnique({
        where: { id: claims.userId },
        select: { id: true },
      });

      if (subject) {
        return {
          kind: "user",
          userId: claims.userId,
          email: claims.email,
          subjectKey: `user:${claims.userId}`,
        };
      }
    }
  }

  // No token, an unverifiable one, or one naming a subject that is gone: this
  // request is anonymous and continues as a guest.

  const guestId = normaliseGuestId(request.headers.get("x-guest-id"));
  return { kind: "guest", guestId, subjectKey: `guest:${guestId}` };
}

/** Uniform error body, matching apiErrorSchema in @ruleshop/contracts. */
export function apiError(
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status },
  );
}

/**
 * Wraps a handler so an unexpected throw becomes a 500 with a safe body rather
 * than leaking a stack trace to the storefront.
 */
export async function handleApiRoute<T>(
  fn: () => Promise<NextResponse<T> | NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (cause) {
    console.error("[api]", cause);
    return apiError("Eroare internă", 500);
  }
}
