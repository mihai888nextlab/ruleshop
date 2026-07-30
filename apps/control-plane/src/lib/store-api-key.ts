import { createHash, randomBytes } from "crypto";
import type { Store } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Storefront → control plane store identity.
 *
 * The SPA ships with one API key per deploy. Every public storefront route
 * resolves the store from that key; a client-supplied storeId is never trusted.
 */

export const STORE_API_KEY_HEADER = "x-ruleshop-key";

export type StoreFromApiKey = Pick<Store, "id" | "slug" | "name">;

export function hashStoreApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateStoreApiKeyPlaintext(): string {
  return `rsk_${randomBytes(24).toString("base64url")}`;
}

export function keyPrefixOf(plaintext: string): string {
  return plaintext.slice(0, 12);
}

/**
 * Creates an active key. Returns the plaintext exactly once — it is not stored.
 */
export async function issueStoreApiKey(
  storeId: string,
  name = "default",
): Promise<{ id: string; plaintext: string; prefix: string }> {
  const plaintext = generateStoreApiKeyPlaintext();
  const prefix = keyPrefixOf(plaintext);
  const row = await prisma.storeApiKey.create({
    data: {
      storeId,
      name,
      keyPrefix: prefix,
      keyHash: hashStoreApiKey(plaintext),
    },
  });
  return { id: row.id, plaintext, prefix };
}

/** Issues a key with a caller-chosen plaintext (seed / tests only). */
export async function issueStoreApiKeyWithPlaintext(
  storeId: string,
  plaintext: string,
  name = "default",
): Promise<{ id: string; plaintext: string; prefix: string }> {
  const prefix = keyPrefixOf(plaintext);
  const row = await prisma.storeApiKey.create({
    data: {
      storeId,
      name,
      keyPrefix: prefix,
      keyHash: hashStoreApiKey(plaintext),
    },
  });
  return { id: row.id, plaintext, prefix };
}

/**
 * Revokes every active key for the store, then issues a new one.
 * Returns the new plaintext once.
 */
export async function rotateStoreApiKey(
  storeId: string,
  name = "default",
): Promise<{ id: string; plaintext: string; prefix: string }> {
  await prisma.storeApiKey.updateMany({
    where: { storeId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return issueStoreApiKey(storeId, name);
}

export function extractStoreApiKey(request: Request): string | null {
  const header = request.headers.get(STORE_API_KEY_HEADER)?.trim();
  if (header) return header;

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    // Customer JWTs are not store keys; store keys always use the rsk_ prefix.
    if (token.startsWith("rsk_")) return token;
  }
  return null;
}

export async function resolveStoreFromApiKey(
  request: Request,
): Promise<StoreFromApiKey | null> {
  const plaintext = extractStoreApiKey(request);
  if (!plaintext) return null;

  const row = await prisma.storeApiKey.findUnique({
    where: { keyHash: hashStoreApiKey(plaintext) },
    select: {
      revokedAt: true,
      store: { select: { id: true, slug: true, name: true } },
    },
  });

  if (!row || row.revokedAt) return null;
  return row.store;
}

export async function listActiveApiKeyMeta(storeId: string) {
  return prisma.storeApiKey.findMany({
    where: { storeId, revokedAt: null },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
