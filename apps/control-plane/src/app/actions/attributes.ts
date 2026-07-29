"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { findRulesReferencingAttribute } from "@/lib/context-schema";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

/**
 * Administration of customer attribute definitions.
 *
 * Each definition extends the store's rule vocabulary, so these actions are
 * restricted to store administrators and audited: adding a field changes what
 * rules can be written, and removing one can invalidate rules already published.
 */

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const attributeInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      KEY_PATTERN,
      "cheia trebuie să înceapă cu o literă și să conțină doar litere mici, cifre și _",
    ),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  type: z.enum(["string", "number", "boolean", "enum", "date"]),
  options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  required: z.boolean().default(false),
  showOnProfile: z.boolean().default(true),
});

async function adminContext(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error("Magazin inexistent");
  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) throw new Error(authz.error);
  return { store, authz };
}

export async function createAttribute(slug: string, input: unknown) {
  const { store, authz } = await adminContext(slug);

  const parsed = attributeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  const data = parsed.data;

  // An enum with no options can never match anything, which would be a silently
  // dead field in the editor.
  if (data.type === "enum" && data.options.length === 0) {
    throw new Error("Un atribut de tip listă are nevoie de cel puțin o opțiune");
  }

  const existing = await prisma.customerAttributeDef.findUnique({
    where: { storeId_key: { storeId: store.id, key: data.key } },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Există deja un atribut cu cheia "${data.key}"`);
  }

  const count = await prisma.customerAttributeDef.count({
    where: { storeId: store.id },
  });

  const created = await prisma.customerAttributeDef.create({
    data: {
      storeId: store.id,
      key: data.key,
      label: data.label,
      description: data.description,
      type: data.type,
      options: data.type === "enum" ? data.options : [],
      required: data.required,
      showOnProfile: data.showOnProfile,
      position: count,
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "attribute.created",
    entity: "CustomerAttributeDef",
    entityId: created.id,
    meta: { key: data.key, type: data.type },
  });

  revalidatePath(`/s/${slug}/attributes`);
  revalidatePath(`/s/${slug}/rules`);
  return { id: created.id };
}

/**
 * Updates presentation and validation, but never the key or type.
 *
 * Both are load-bearing for rules that already reference the attribute: the key
 * is the path a condition points at, and the type decides which operators are
 * legal. Changing either would silently invalidate published rules, so a
 * different type means a new attribute.
 */
export async function updateAttribute(
  slug: string,
  id: string,
  input: unknown,
) {
  const { store, authz } = await adminContext(slug);

  const updateSchema = attributeInputSchema
    .omit({ key: true, type: true })
    .partial();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }

  const existing = await prisma.customerAttributeDef.findFirst({
    where: { id, storeId: store.id },
  });
  if (!existing) throw new Error("Atribut inexistent");

  if (
    existing.type === "enum" &&
    parsed.data.options !== undefined &&
    parsed.data.options.length === 0
  ) {
    throw new Error("Un atribut de tip listă are nevoie de cel puțin o opțiune");
  }

  await prisma.customerAttributeDef.update({
    where: { id },
    data: {
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.required !== undefined
        ? { required: parsed.data.required }
        : {}),
      ...(parsed.data.showOnProfile !== undefined
        ? { showOnProfile: parsed.data.showOnProfile }
        : {}),
      ...(existing.type === "enum" && parsed.data.options !== undefined
        ? { options: parsed.data.options }
        : {}),
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "attribute.updated",
    entity: "CustomerAttributeDef",
    entityId: id,
    meta: { key: existing.key, changes: parsed.data },
  });

  revalidatePath(`/s/${slug}/attributes`);
  return { ok: true };
}

/**
 * Archives an attribute: existing rules keep working and stored values are
 * kept, but it is no longer offered for new rules or shown on the profile.
 *
 * This is the safe alternative to deletion and is why deletion can afford to be
 * strict.
 */
export async function archiveAttribute(
  slug: string,
  id: string,
  archived: boolean,
) {
  const { store, authz } = await adminContext(slug);

  const existing = await prisma.customerAttributeDef.findFirst({
    where: { id, storeId: store.id },
    select: { id: true, key: true },
  });
  if (!existing) throw new Error("Atribut inexistent");

  await prisma.customerAttributeDef.update({
    where: { id },
    data: { archived },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: archived ? "attribute.archived" : "attribute.restored",
    entity: "CustomerAttributeDef",
    entityId: id,
    meta: { key: existing.key },
  });

  revalidatePath(`/s/${slug}/attributes`);
  revalidatePath(`/s/${slug}/rules`);
  return { ok: true };
}

/**
 * Deletes an attribute, but refuses while any live rule reads it.
 *
 * Silently dropping the field would leave those conditions pointing at a path
 * that no longer resolves — they would stop matching with no error anywhere.
 * The caller is told exactly which rules to fix first.
 */
export async function deleteAttribute(slug: string, id: string) {
  const { store, authz } = await adminContext(slug);

  const existing = await prisma.customerAttributeDef.findFirst({
    where: { id, storeId: store.id },
    select: { id: true, key: true, label: true },
  });
  if (!existing) throw new Error("Atribut inexistent");

  const references = await findRulesReferencingAttribute(store.id, existing.key);
  if (references.length > 0) {
    const list = references
      .map((r) => `${r.ruleKey} (v${r.rulesetVersion})`)
      .join(", ");
    throw new Error(
      `Atributul "${existing.label}" este folosit de ${references.length} regulă/reguli: ${list}. ` +
        `Modifică sau șterge regulile mai întâi, ori arhivează atributul.`,
    );
  }

  await prisma.customerAttributeDef.delete({ where: { id } });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "attribute.deleted",
    entity: "CustomerAttributeDef",
    entityId: id,
    meta: { key: existing.key },
  });

  revalidatePath(`/s/${slug}/attributes`);
  revalidatePath(`/s/${slug}/rules`);
  return { ok: true };
}

/** Reorders the profile form and editor palette. */
export async function reorderAttributes(slug: string, orderedIds: string[]) {
  const { store, authz } = await adminContext(slug);

  const owned = await prisma.customerAttributeDef.findMany({
    where: { storeId: store.id, id: { in: orderedIds } },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    throw new Error("Listă de atribute invalidă");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.customerAttributeDef.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "attribute.reordered",
    entity: "CustomerAttributeDef",
    meta: { count: orderedIds.length },
  });

  revalidatePath(`/s/${slug}/attributes`);
  return { ok: true };
}
