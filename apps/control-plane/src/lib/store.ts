import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const GUEST_COOKIE = "rs_guest";

/** Read-only in RSC. Cookie is created by middleware. */
export async function getOrCreateGuestId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing) return existing;
  // Fallback for contexts without middleware (should be rare)
  return `g_ephemeral_${crypto.randomUUID()}`;
}

export async function getStoreBySlug(slug: string) {
  return prisma.store.findUnique({
    where: { slug },
    include: { deployment: true },
  });
}

export function parseKillCategories(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}

/** Reads a JSON string array column defensively. */
export function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export function parseNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is number => typeof v === "number" && Number.isInteger(v),
  );
}
