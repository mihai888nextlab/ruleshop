import { NextResponse } from "next/server";
import { authResponseSchema, loginRequestSchema } from "@ruleshop/contracts";
import bcrypt from "bcryptjs";
import { apiError, signCustomerToken } from "@/lib/api-identity";
import { handleCorsApiRoute } from "@/lib/cors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";

const DUMMY_HASH =
  "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

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

    // Membership is the tenant boundary for customers — no auto-join on login.
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
