import { NextResponse } from "next/server";
import type { CustomerAttributeDef, Prisma } from "@prisma/client";
import {
  profileResponseSchema,
  profileUpdateRequestSchema,
  profileUpdateResponseSchema,
  type ProfileField,
} from "@ruleshop/contracts";
import type { FieldType } from "@ruleshop/engine";
import { apiError, resolveApiIdentity } from "@/lib/api-identity";
import {
  coerceProfileInput,
  loadStoreAttributes,
  validateProfileValues,
} from "@/lib/context-schema";
import { handleCorsApiRoute } from "@/lib/cors";
import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  requireStoreApiKey,
} from "@/lib/require-store-api-key";

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

export async function OPTIONS(request: Request) {
  return handleCorsApiRoute(request, async () => new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

    const identity = await resolveApiIdentity(request, store.id);
    if (identity.kind !== "user") {
      return apiError("Autentificare necesară", 401);
    }

    const [defs, profile] = await Promise.all([
      loadStoreAttributes(store.id),
      prisma.customerProfile.findUnique({
        where: {
          storeId_userId: { storeId: store.id, userId: identity.userId },
        },
        select: { values: true },
      }),
    ]);

    const values = readValues(profile?.values);
    const fields = defs
      .filter((def) => def.showOnProfile)
      .map((def) => toProfileField(def, values));

    return NextResponse.json(profileResponseSchema.parse({ fields }), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}

export async function PUT(request: Request) {
  return handleCorsApiRoute(request, async () => {
    const store = await requireStoreApiKey(request);
    if (isErrorResponse(store)) return store;

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

    const existing = await prisma.customerProfile.findUnique({
      where: { storeId_userId: { storeId: store.id, userId: identity.userId } },
      select: { values: true },
    });

    const merged: Record<string, unknown> = {
      ...readValues(existing?.values),
      ...result.values,
    };
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
