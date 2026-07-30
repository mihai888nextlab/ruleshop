import { NextResponse } from "next/server";
import type { CustomerAttributeDef, Prisma } from "@prisma/client";
import {
  profileResponseSchema,
  profileUpdateRequestSchema,
  profileUpdateResponseSchema,
  type ProfileField,
} from "@ruleshop/contracts";
import type { FieldType } from "@ruleshop/engine";
import { apiError, handleApiRoute, resolveApiIdentity } from "@/lib/api-identity";
import { loyaltyBalance } from "@/lib/customer-facts";
import {
  coerceProfileInput,
  loadStoreAttributes,
  validateProfileValues,
} from "@/lib/context-schema";
import { prisma } from "@/lib/prisma";
import { findStoreBySlug } from "@/lib/storefront-read";

/**
 * The customer's own profile for one store.
 *
 * GET describes the fields this store defined together with the customer's
 * current values, so the storefront can render a form for a schema it has no
 * compile-time knowledge of. PUT validates and stores them.
 *
 * Both require a customer token: guests have no profile, and the profile read is
 * always scoped to the authenticated subject, so there is no request shape that
 * reads someone else's data.
 */

function toProfileField(
  def: CustomerAttributeDef,
  values: Record<string, unknown>,
): ProfileField {
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    type: def.type as FieldType,
    options: Array.isArray(def.options)
      ? (def.options as unknown[]).filter(
          (o): o is string => typeof o === "string",
        )
      : [],
    required: def.required,
    value: values[def.key] ?? null,
  };
}

function readValues(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const identity = await resolveApiIdentity(request, store.id);
    if (identity.kind !== "user") {
      return apiError("Autentificare necesară", 401);
    }

    const [defs, profile, membership] = await Promise.all([
      loadStoreAttributes(store.id),
      prisma.customerProfile.findUnique({
        where: {
          storeId_userId: { storeId: store.id, userId: identity.userId },
        },
        select: { values: true },
      }),
      prisma.membership.findUnique({
        where: {
          storeId_userId: { storeId: store.id, userId: identity.userId },
        },
        select: { loyaltyPoints: true },
      }),
    ]);

    const values = readValues(profile?.values);
    const fields = defs
      .filter((def) => def.showOnProfile)
      .map((def) => toProfileField(def, values));

    return NextResponse.json(
      profileResponseSchema.parse({
        fields,
        loyalty: loyaltyBalance(membership?.loyaltyPoints ?? 0),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleApiRoute(async () => {
    const { slug } = await params;
    const store = await findStoreBySlug(slug);
    if (!store) return apiError("Magazin inexistent", 404);

    const identity = await resolveApiIdentity(request, store.id);
    if (identity.kind !== "user") {
      return apiError("Autentificare necesară", 401);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = profileUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Date invalide", 400, parsed.error.flatten());
    }

    const defs = await loadStoreAttributes(store.id);
    const writable = defs.filter((def) => def.showOnProfile);

    // Form input arrives as text, so coerce to the declared types first and let
    // validation stay strict about what it accepts.
    const coerced = coerceProfileInput(writable, parsed.data.values);
    const result = validateProfileValues(writable, coerced);

    if (!result.ok) {
      const fields = writable.map((def) => toProfileField(def, coerced));
      return NextResponse.json(
        profileUpdateResponseSchema.parse({
          ok: false,
          fields,
          errors: result.errors,
        }),
        { status: 422 },
      );
    }

    // Merge rather than replace: fields hidden from the profile, or belonging to
    // archived attributes, keep whatever value they already had.
    const existing = await prisma.customerProfile.findUnique({
      where: { storeId_userId: { storeId: store.id, userId: identity.userId } },
      select: { values: true },
    });

    const merged: Record<string, unknown> = {
      ...readValues(existing?.values),
      ...result.values,
    };
    // Prisma's Json input type does not accept `unknown` values; the contents
    // have already been validated against the store's definitions above.
    const mergedJson = merged as Prisma.InputJsonObject;

    await prisma.customerProfile.upsert({
      where: { storeId_userId: { storeId: store.id, userId: identity.userId } },
      create: {
        storeId: store.id,
        userId: identity.userId,
        values: mergedJson,
      },
      update: { values: mergedJson },
    });

    const fields = writable.map((def) => toProfileField(def, merged));

    return NextResponse.json(
      profileUpdateResponseSchema.parse({ ok: true, fields, errors: {} }),
    );
  });
}
