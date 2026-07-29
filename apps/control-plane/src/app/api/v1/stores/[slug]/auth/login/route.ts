import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authResponseSchema, loginRequestSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, signCustomerToken } from "@/lib/api-identity";
import { prisma } from "@/lib/prisma";
import { findStoreBySlug } from "@/lib/storefront-read";

/**
 * Customer login for one store.
 *
 * A wrong password and an unknown address return the same message, and a hash
 * comparison runs even when no account matched, so response time does not
 * reveal whether the address exists.
 */
const DUMMY_HASH = "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

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
        loyaltyPoints: true,
        passwordHash: true,
        memberships: {
          where: { storeId: store.id },
          select: { role: true },
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

    // Being a customer of one store does not grant access to another. First
    // login at a new store joins it; nothing is shared but the credentials.
    if (user.memberships.length === 0) {
      await prisma.membership.create({
        data: { storeId: store.id, userId: user.id, role: "CUSTOMER" },
      });
    }

    const { token, expiresIn } = await signCustomerToken(user);
    return NextResponse.json(
      authResponseSchema.parse({
        token,
        expiresIn,
        customer: {
          id: user.id,
          email: user.email,
          name: user.name,
          loyaltyPoints: user.loyaltyPoints,
        },
      }),
    );
  });
}
