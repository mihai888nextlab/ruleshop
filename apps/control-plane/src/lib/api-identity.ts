import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "./prisma";

/**
 * Identity for the storefront-facing API.
 *
 * Customers authenticate with a bearer token rather than a cookie, because the
 * storefront runs on a different origin than the control plane and cross-site
 * credentialled cookies are both fragile and a CSRF liability.
 *
 * Tokens are bound to a storeId so a session minted for atelier-nord cannot be
 * replayed against circuit-hub — even with a valid signature.
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
  storeId: z.string().min(1),
});

export async function signCustomerToken(
  user: { id: string; email: string },
  storeId: string,
): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ email: user.email, storeId })
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
): Promise<{ userId: string; email: string; storeId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "ruleshop-control-plane",
      audience: "ruleshop-storefront",
    });
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) return null;
    return {
      userId: parsed.data.sub,
      email: parsed.data.email,
      storeId: parsed.data.storeId,
    };
  } catch {
    return null;
  }
}

export type ApiIdentity =
  | { kind: "user"; userId: string; email: string; subjectKey: string }
  | { kind: "guest"; guestId: string; subjectKey: string };

/**
 * Guest ids come from an untrusted client, so they are normalised before use.
 */
const GUEST_ID_PATTERN = /^g_[A-Za-z0-9_-]{8,64}$/;

function normaliseGuestId(raw: string | null): string {
  if (raw && GUEST_ID_PATTERN.test(raw)) return raw;
  return "g_anonymous";
}

/**
 * Resolves the caller for a store-scoped request.
 *
 * `storeId` is required: a bearer token for another store is ignored (guest),
 * so multi-tenant isolation does not depend on the client “being honest”.
 */
export async function resolveApiIdentity(
  request: Request,
  storeId: string,
): Promise<ApiIdentity> {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (bearer && !bearer.startsWith("rsk_")) {
    const claims = await verifyCustomerToken(bearer);
    if (claims && claims.storeId === storeId) {
      const subject = await prisma.user.findUnique({
        where: { id: claims.userId },
        select: {
          id: true,
          memberships: {
            where: { storeId },
            select: { id: true },
            take: 1,
          },
        },
      });

      // Deleted account or no membership at this store → guest.
      if (subject && subject.memberships.length > 0) {
        return {
          kind: "user",
          userId: claims.userId,
          email: claims.email,
          subjectKey: `user:${claims.userId}`,
        };
      }
    }
  }

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
