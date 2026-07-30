import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authResponseSchema, registerRequestSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, signCustomerToken } from "@/lib/api-identity";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { findStoreBySlug } from "@/lib/storefront-read";

const BCRYPT_ROUNDS = 12;

/**
 * Customer registration, scoped to the store the shopper is browsing.
 *
 * Registration grants a CUSTOMER membership for this store only. An account
 * that exists but has no membership here is joined to the store rather than
 * rejected, so the same person shopping at a second store does not need a
 * second set of credentials — but loyalty stays per membership.
 */
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
    const limited = rateLimit(`register:${store.id}:${ip}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return apiError("Prea multe încercări. Încearcă din nou.", 429);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = registerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Date invalide", 400, parsed.error.flatten());
    }
    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (existing) {
      const matches = await bcrypt.compare(password, existing.passwordHash);
      if (!matches) {
        return apiError(
          "Există deja un cont cu acest email. Autentifică-te pentru a continua.",
          409,
        );
      }

      const membership = await prisma.membership.upsert({
        where: { storeId_userId: { storeId: store.id, userId: existing.id } },
        create: { storeId: store.id, userId: existing.id, role: "CUSTOMER" },
        update: {},
        select: { loyaltyPoints: true },
      });

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: existing.id },
        select: { id: true, email: true, name: true },
      });
      const { token, expiresIn } = await signCustomerToken(user, store.id);
      return NextResponse.json(
        authResponseSchema.parse({
          token,
          expiresIn,
          customer: {
            ...user,
            loyaltyPoints: membership.loyaltyPoints,
          },
        }),
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash,
        memberships: {
          create: { storeId: store.id, role: "CUSTOMER" },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: {
          where: { storeId: store.id },
          select: { loyaltyPoints: true },
          take: 1,
        },
      },
    });

    const { token, expiresIn } = await signCustomerToken(user, store.id);
    return NextResponse.json(
      authResponseSchema.parse({
        token,
        expiresIn,
        customer: {
          id: user.id,
          email: user.email,
          name: user.name,
          loyaltyPoints: user.memberships[0]?.loyaltyPoints ?? 0,
        },
      }),
      { status: 201 },
    );
  });
}
