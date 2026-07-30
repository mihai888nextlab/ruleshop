"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { provisionStore } from "@/lib/provision-store";
import { rateLimit } from "@/lib/rate-limit";
import {
  listActiveApiKeyMeta,
  rotateStoreApiKey,
} from "@/lib/store-api-key";
import {
  buildCloneCommand,
  buildDegitCommand,
  degitSource,
  publicApiUrl,
  storefrontImage,
} from "@/lib/storefront-clone";
import { getTranslator } from "@/i18n/server";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*$/, "slug invalid");

const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  adminName: z.string().trim().min(1).max(80),
  adminEmail: z.string().trim().email().max(200),
  adminPassword: z.string().min(8).max(120),
});

async function requirePlatformAdmin() {
  const session = await auth();
  if (!session?.user || session.user.platformRole !== "PLATFORM_ADMIN") {
    const t = await getTranslator();
    throw new Error(t("errors.unauthorized"));
  }
  return session;
}

export type CreateStoreResult =
  | {
      ok: true;
      store: { id: string; slug: string; name: string };
      admin: { email: string; name: string | null };
      apiKey: string;
      cloneCommand: string;
      adminReused: boolean;
    }
  | { ok: false; error: string };

export async function createStoreAction(
  input: unknown,
): Promise<CreateStoreResult> {
  await requirePlatformAdmin();

  const t = await getTranslator();
  const parsed = createStoreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: t("errors.invalidStoreAdmin"),
    };
  }

  const result = await provisionStore({
    name: parsed.data.name,
    slug: parsed.data.slug,
    admin: {
      email: parsed.data.adminEmail,
      password: parsed.data.adminPassword,
      name: parsed.data.adminName,
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/platform");
  revalidatePath("/");
  return {
    ok: true,
    store: result.data.store,
    admin: result.data.admin,
    apiKey: result.data.apiKey,
    cloneCommand: result.data.cloneCommand,
    adminReused: result.data.adminReused,
  };
}

/** Public self-serve: open a store + create its STORE_ADMIN in one step. */
export async function openStoreAction(
  input: unknown,
): Promise<CreateStoreResult> {
  const t = await getTranslator();
  const limited = rateLimit("open-store:global", {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return {
      ok: false,
      error: t("errors.rateLimitedMinute"),
    };
  }

  const parsed = createStoreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: t("errors.invalidStoreAdmin"),
    };
  }

  const result = await provisionStore({
    name: parsed.data.name,
    slug: parsed.data.slug,
    admin: {
      email: parsed.data.adminEmail,
      password: parsed.data.adminPassword,
      name: parsed.data.adminName,
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/");
  revalidatePath("/platform");
  return {
    ok: true,
    store: result.data.store,
    admin: result.data.admin,
    apiKey: result.data.apiKey,
    cloneCommand: result.data.cloneCommand,
    adminReused: result.data.adminReused,
  };
}

export async function rotateStoreKeyAction(slug: string): Promise<
  | {
      ok: true;
      apiKey: string;
      cloneCommand: string;
      degitCommand: string;
      prefix: string;
    }
  | { ok: false; error: string }
> {
  const t = await getTranslator();
  const session = await auth();
  if (!session?.user) return { ok: false, error: t("errors.unauthorized") };

  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store) return { ok: false, error: t("errors.storeNotFound") };

  const isPlatform = session.user.platformRole === "PLATFORM_ADMIN";
  if (!isPlatform) {
    const membership = await prisma.membership.findUnique({
      where: {
        storeId_userId: { storeId: store.id, userId: session.user.id },
      },
    });
    if (!membership || membership.role !== "STORE_ADMIN") {
      return { ok: false, error: t("errors.unauthorized") };
    }
  }

  const key = await rotateStoreApiKey(store.id, "default");
  await writeAudit({
    storeId: store.id,
    userId: session.user.id,
    action: "store.api_key.rotated",
    entity: "StoreApiKey",
    entityId: key.id,
    meta: { prefix: key.prefix },
  });
  revalidatePath(`/s/${slug}/admin/connection`);
  revalidatePath(`/s/${slug}/admin`);
  return {
    ok: true,
    apiKey: key.plaintext,
    prefix: key.prefix,
    cloneCommand: buildCloneCommand(key.plaintext),
    degitCommand: buildDegitCommand(key.plaintext),
  };
}

export async function getStoreConnectionInfo(slug: string) {
  const session = await auth();
  if (!session?.user) return null;

  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store) return null;

  const isPlatform = session.user.platformRole === "PLATFORM_ADMIN";
  if (!isPlatform) {
    const membership = await prisma.membership.findUnique({
      where: {
        storeId_userId: { storeId: store.id, userId: session.user.id },
      },
    });
    if (!membership || membership.role !== "STORE_ADMIN") {
      return null;
    }
  }

  const keys = await listActiveApiKeyMeta(store.id);
  return {
    store: { id: store.id, slug: store.slug, name: store.name },
    keys,
    apiUrl: publicApiUrl(),
    degitSource: degitSource(),
    storefrontImage: storefrontImage(),
  };
}
