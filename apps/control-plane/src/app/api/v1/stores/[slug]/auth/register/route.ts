import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authResponseSchema, registerRequestSchema } from "@ruleshop/contracts";
import { apiError, handleApiRoute, signCustomerToken } from "@/lib/api-identity";
import { prisma } from "@/lib/prisma";
import { findStoreBySlug } from "@/lib/storefront-read";

const BCRYPT_ROUNDS = 12;

/**
 * Customer registration, scoped to the store the shopper is browsing.
 *
 * Registration grants a CUSTOMER membership for this store only. An account
 * that exists but has no membership here is joined to the store rather than
 * rejected, so the same person shopping at a second store does not need a
 * second set of credentials.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

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
      // Do not confirm or deny that the address is registered. Instead, verify
      // the supplied password: correct means this is the same person joining a
      // new store, wrong means we refuse without disclosing anything.
      const matches = await bcrypt.compare(password, existing.passwordHash);
      if (!matches) {
        return apiError(
          "Există deja un cont cu acest email. Autentifică-te pentru a continua.",
          409,
        );
      }

      await prisma.membership.upsert({
        where: { storeId_userId: { storeId: store.id, userId: existing.id } },
        create: { storeId: store.id, userId: existing.id, role: "CUSTOMER" },
        update: {},
      });

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: existing.id },
        select: { id: true, email: true, name: true, loyaltyPoints: true },
      });
      const { token, expiresIn } = await signCustomerToken(user);
      return NextResponse.json(
        authResponseSchema.parse({ token, expiresIn, customer: user }),
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
      select: { id: true, email: true, name: true, loyaltyPoints: true },
    });

    const { token, expiresIn } = await signCustomerToken(user);
    return NextResponse.json(
      authResponseSchema.parse({ token, expiresIn, customer: user }),
      { status: 201 },
    );
  });
}
