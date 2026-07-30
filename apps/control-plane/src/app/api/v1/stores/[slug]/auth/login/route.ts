import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authResponseSchema, loginRequestSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, signCustomerToken } from "@/lib/api-identity";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { findStoreBySlug } from "@/lib/storefront-read";

/**
 * Customer login for one store.
 *
 * A wrong password and an unknown address return the same message, and a hash
 * comparison runs even when no account matched, so response time does not
 * reveal whether the address exists. Membership is required — credentials alone
 * do not join a new tenant.
 */
const DUMMY_HASH =
  "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const limited = rateLimit(`login:${store.id}:${ip}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return apiError("Prea multe încercări. Încearcă din nou.", 429);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Date invalide", 400, parsed.error.flatten());
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        memberships: {
          where: { storeId: store.id },
          select: { role: true, loyaltyPoints: true },
        },
      },
    });

    const matches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !matches) {
      return apiError("Email sau parolă incorectă", 401);
    }

    const membership = user.memberships[0];
    if (!membership) {
      return apiError(
        "Nu ai un cont la acest magazin. Înregistrează-te pentru a continua.",
        403,
      );
    }

    const { token, expiresIn } = await signCustomerToken(user, store.id);
    return NextResponse.json(
      authResponseSchema.parse({
        token,
        expiresIn,
        customer: {
          id: user.id,
          email: user.email,
          name: user.name,
          loyaltyPoints: membership.loyaltyPoints,
        },
      }),
    );
  });
}
