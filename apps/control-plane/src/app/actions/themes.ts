"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Action } from "@ruleshop/engine";
import {
  DEFAULT_THEME_TOKENS,
  themeInputSchema,
  themeTokensSchema,
} from "@ruleshop/contracts";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveProductImage } from "@/lib/product-image-upload";
import { getStoreBySlug } from "@/lib/store";
import { getTranslator } from "@/i18n/server";

/**
 * Theme administration.
 *
 * Themes are the design half of the `theme` decision point: rules choose a key,
 * these actions define what that key looks like. Restricted to store
 * administrators and audited, because publishing a theme changes what every
 * customer in the selected cohort sees.
 */

async function adminContext(slug: unknown) {
  const t = await getTranslator();
  const parsed = z.string().trim().min(1).max(80).safeParse(slug);
  if (!parsed.success) throw new Error(t("errors.invalidStore"));

  const store = await getStoreBySlug(parsed.data);
  if (!store) throw new Error(t("errors.storeNotFound"));

  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) throw new Error(authz.error);

  return { store, authz, slug: parsed.data };
}

function parseId(id: unknown): string {
  const parsed = z.string().trim().min(1).max(60).safeParse(id);
  if (!parsed.success) throw new Error("Identificator invalid");
  return parsed.data;
}

/** Which rules select a theme by this key, across every live ruleset. */
async function findRulesUsingTheme(storeId: string, key: string) {
  const rulesets = await prisma.ruleset.findMany({
    where: { storeId, status: { not: "archived" } },
    select: {
      version: true,
      rules: {
        where: { category: "theme" },
        select: { key: true, name: true, actions: true },
      },
    },
  });

  const hits: { rulesetVersion: number; ruleKey: string; ruleName: string }[] =
    [];

  for (const ruleset of rulesets) {
    for (const rule of ruleset.rules) {
      const actions = (rule.actions ?? []) as Action[];
      const selectsTheme = actions.some(
        (action) => action.type === "setTheme" && action.themeId === key,
      );
      if (selectsTheme) {
        hits.push({
          rulesetVersion: ruleset.version,
          ruleKey: rule.key,
          ruleName: rule.name,
        });
      }
    }
  }

  return hits;
}

export async function createTheme(slug: string, input: unknown) {
  const { store, authz } = await adminContext(slug);

  const parsed = themeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  }

  const existing = await prisma.theme.findUnique({
    where: { storeId_key: { storeId: store.id, key: parsed.data.key } },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Există deja o temă cu cheia "${parsed.data.key}"`);
  }

  const count = await prisma.theme.count({ where: { storeId: store.id } });

  const created = await prisma.theme.create({
    data: {
      storeId: store.id,
      key: parsed.data.key,
      name: parsed.data.name,
      tokens: parsed.data.tokens,
      // The first theme becomes the default, so a store is never left with
      // themes defined but none applied.
      isDefault: count === 0,
    },
    select: { id: true, key: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "theme.created",
    entity: "Theme",
    entityId: created.id,
    meta: { key: created.key },
  });

  revalidatePath(`/s/${slug}/themes`);
  revalidatePath(`/s/${slug}/rules`);
  return { id: created.id, key: created.key };
}

/**
 * Updates a theme's name and tokens, never its key.
 *
 * The key is what published rules point at; changing it would silently detach
 * every rule that selects this theme.
 */
export async function updateTheme(
  slug: string,
  rawId: unknown,
  input: unknown,
) {
  const { store, authz } = await adminContext(slug);
  const id = parseId(rawId);

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(60).optional(),
      tokens: themeTokensSchema.optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  }

  const existing = await prisma.theme.findFirst({
    where: { id, storeId: store.id },
    select: { id: true, key: true },
  });
  if (!existing) throw new Error("Temă inexistentă");

  await prisma.theme.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.tokens !== undefined
        ? { tokens: parsed.data.tokens }
        : {}),
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "theme.updated",
    entity: "Theme",
    entityId: id,
    meta: { key: existing.key, renamed: parsed.data.name ?? null },
  });

  revalidatePath(`/s/${slug}/themes`);
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}

/** Marks the theme applied when no rule expresses a preference. */
export async function setDefaultTheme(slug: string, rawId: unknown) {
  const { store, authz } = await adminContext(slug);
  const id = parseId(rawId);

  const theme = await prisma.theme.findFirst({
    where: { id, storeId: store.id },
    select: { id: true, key: true },
  });
  if (!theme) throw new Error("Temă inexistentă");

  // One default per store, so the two writes belong together.
  await prisma.$transaction([
    prisma.theme.updateMany({
      where: { storeId: store.id, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.theme.update({ where: { id }, data: { isDefault: true } }),
  ]);

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "theme.set_default",
    entity: "Theme",
    entityId: id,
    meta: { key: theme.key },
  });

  revalidatePath(`/s/${slug}/themes`);
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}

/**
 * Deletes a theme, refusing while a live rule selects it.
 *
 * Removing it silently would leave those rules naming a theme that resolves to
 * nothing, and the shop would quietly fall back to defaults for the cohort they
 * targeted.
 */
export async function deleteTheme(slug: string, rawId: unknown) {
  const { store, authz } = await adminContext(slug);
  const id = parseId(rawId);

  const theme = await prisma.theme.findFirst({
    where: { id, storeId: store.id },
    select: { id: true, key: true, name: true, isDefault: true },
  });
  if (!theme) throw new Error("Temă inexistentă");

  const users = await findRulesUsingTheme(store.id, theme.key);
  if (users.length > 0) {
    const list = users
      .map((row) => `${row.ruleKey} (v${row.rulesetVersion})`)
      .join(", ");
    throw new Error(
      `Tema "${theme.name}" este selectată de ${users.length} regulă/reguli: ${list}. Modifică regulile mai întâi.`,
    );
  }

  await prisma.theme.delete({ where: { id } });

  // Deleting the default would leave the store with none, so promote another.
  if (theme.isDefault) {
    const next = await prisma.theme.findFirst({
      where: { storeId: store.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (next) {
      await prisma.theme.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "theme.deleted",
    entity: "Theme",
    entityId: id,
    meta: { key: theme.key },
  });

  revalidatePath(`/s/${slug}/themes`);
  revalidatePath(`/s/${slug}/rules`);
  return { ok: true };
}

/** Copies a theme, so a variant can be tried without editing the original. */
export async function duplicateTheme(slug: string, rawId: unknown) {
  const { store, authz } = await adminContext(slug);
  const id = parseId(rawId);

  const source = await prisma.theme.findFirst({
    where: { id, storeId: store.id },
  });
  if (!source) throw new Error("Temă inexistentă");

  // Find a free key rather than failing on a collision.
  let suffix = 2;
  let key = `${source.key}-${suffix}`;
  while (
    await prisma.theme.findUnique({
      where: { storeId_key: { storeId: store.id, key } },
      select: { id: true },
    })
  ) {
    suffix += 1;
    key = `${source.key}-${suffix}`;
    if (suffix > 50) throw new Error("Prea multe copii ale acestei teme");
  }

  const created = await prisma.theme.create({
    data: {
      storeId: store.id,
      key,
      name: `${source.name} (copie)`,
      tokens: source.tokens as object,
      isDefault: false,
    },
    select: { id: true, key: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "theme.duplicated",
    entity: "Theme",
    entityId: created.id,
    meta: { from: source.key, to: created.key },
  });

  revalidatePath(`/s/${slug}/themes`);
  return { id: created.id, key: created.key };
}

/** Starting point for a new theme. */
export async function defaultTokens() {
  return DEFAULT_THEME_TOKENS;
}

/**
 * Uploads a hero image for the theme composer. Returns a path that may be
 * stored in `tokens.heroImage` and served from the control plane.
 */
export async function uploadThemeHeroImage(
  slug: string,
  formData: FormData,
): Promise<string> {
  await adminContext(slug);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selectează o imagine");
  }
  return saveProductImage(slug, file);
}
