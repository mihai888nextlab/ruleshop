"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DecisionType, RulesetStatus } from "@prisma/client";
import { validateRule, validateRuleset } from "@ruleshop/engine";
import type { Action, Condition, RuleDefinition } from "@ruleshop/engine";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { loadContextSchema, loadEditorSchema } from "@/lib/context-schema";
import { prisma } from "@/lib/prisma";
import {
  getStoreBySlug,
  parseNumberArray,
  parseStringArray,
} from "@/lib/store";

/**
 * Refuses a rule that selects a theme the store has not defined.
 *
 * The engine cannot check this — it only sees a string — but a mistyped key
 * would resolve to nothing and silently leave the targeted cohort on the default
 * theme, which looks like the rule simply not working.
 */
async function assertThemesExist(storeId: string, actions: Action[]) {
  const wanted = [
    ...new Set(
      actions
        .filter((action) => action.type === "setTheme")
        .map((action) => (action as Extract<Action, { type: "setTheme" }>).themeId),
    ),
  ];
  if (wanted.length === 0) return;

  const existing = await prisma.theme.findMany({
    where: { storeId, key: { in: wanted } },
    select: { key: true },
  });
  const known = new Set(existing.map((row) => row.key));
  const missing = wanted.filter((key) => !known.has(key));

  if (missing.length > 0) {
    throw new Error(
      `Tema ${missing.map((key) => `"${key}"`).join(", ")} nu există în acest magazin. Creează-o în secțiunea Teme.`,
    );
  }
}

async function ctx(slug: string, min: "OPERATOR" | "STORE_ADMIN" = "OPERATOR") {
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error("Magazin inexistent");
  const authz = await requireStoreRole(store.id, min);
  if (!authz.ok) throw new Error(authz.error);
  return { store, authz };
}

export async function createDraftRuleset(
  slug: string,
  opts?: { fromVersion?: number; name?: string },
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const latest = await prisma.ruleset.findFirst({
    where: { storeId: store.id },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;

  let rules: RuleDefinition[] = [];
  if (opts?.fromVersion != null) {
    const source = await prisma.ruleset.findUnique({
      where: {
        storeId_version: { storeId: store.id, version: opts.fromVersion },
      },
      include: { rules: true },
    });
    if (source) {
      rules = source.rules.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        category: r.category as RuleDefinition["category"],
        priority: r.priority,
        enabled: r.enabled,
        conditions: r.conditions as Condition,
        actions: r.actions as Action[],
      }));
    }
  }

  const created = await prisma.ruleset.create({
    data: {
      storeId: store.id,
      version,
      status: "draft",
      name: opts?.name ?? `v${version}`,
      createdBy: authz.session.user.id,
      rules: {
        create: rules.map((r) => ({
          key: r.key,
          name: r.name,
          description: r.description ?? "",
          category: r.category,
          priority: r.priority,
          enabled: r.enabled,
          conditions: r.conditions as object,
          actions: r.actions as object[],
        })),
      },
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ruleset.draft_created",
    entity: "Ruleset",
    entityId: created.id,
    meta: { version },
  });
  revalidatePath(`/s/${slug}/rules`);
  return { version, id: created.id };
}

export async function saveRuleInDraft(
  slug: string,
  version: number,
  rule: unknown,
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
  });
  if (!ruleset || ruleset.status !== "draft") {
    throw new Error("Doar draft-urile pot fi editate");
  }

  // Validate against this store's vocabulary, so a condition cannot reference a
  // field the store does not have, or use an operator its type does not support.
  // Authoring uses the active schema: new rules should not reach for an
  // attribute that has been archived.
  const v = validateRule(rule, { schema: await loadEditorSchema(store.id) });
  if (!v.ok || !v.data) throw new Error(v.errors.join("; "));

  await assertThemesExist(store.id, v.data.actions);

  await prisma.rule.upsert({
    where: {
      rulesetId_key: { rulesetId: ruleset.id, key: v.data.key },
    },
    create: {
      rulesetId: ruleset.id,
      key: v.data.key,
      name: v.data.name,
      description: v.data.description ?? "",
      category: v.data.category,
      priority: v.data.priority,
      enabled: v.data.enabled,
      conditions: v.data.conditions as object,
      actions: v.data.actions as object[],
    },
    update: {
      name: v.data.name,
      description: v.data.description ?? "",
      category: v.data.category,
      priority: v.data.priority,
      enabled: v.data.enabled,
      conditions: v.data.conditions as object,
      actions: v.data.actions as object[],
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "rule.saved",
    entity: "Rule",
    entityId: v.data.key,
    meta: { version },
  });
  revalidatePath(`/s/${slug}/rules`);
  revalidatePath(`/s/${slug}/rules/${version}`);
}

export async function deleteRuleFromDraft(
  slug: string,
  version: number,
  key: string,
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
  });
  if (!ruleset || ruleset.status !== "draft") {
    throw new Error("Doar draft-urile pot fi editate");
  }
  await prisma.rule.delete({
    where: { rulesetId_key: { rulesetId: ruleset.id, key } },
  });
  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "rule.deleted",
    entity: "Rule",
    entityId: key,
    meta: { version },
  });
  revalidatePath(`/s/${slug}/rules/${version}`);
}

export async function publishRuleset(
  slug: string,
  version: number,
  mode: "stable" | "canary",
  canaryPercent = 10,
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
    include: { rules: true },
  });
  if (!ruleset) throw new Error("Versiune inexistentă");

  // Publishing validates against the full schema, archived attributes included:
  // archiving one field must not block publishing rules that legitimately
  // referenced it before.
  const check = validateRuleset(
    ruleset.rules.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description,
      category: r.category,
      priority: r.priority,
      enabled: r.enabled,
      conditions: r.conditions,
      actions: r.actions,
    })),
    { schema: await loadContextSchema(store.id) },
  );
  if (!check.ok) throw new Error(check.errors.join("; "));

  const newStatus: RulesetStatus = mode === "canary" ? "canary" : "published";

  await prisma.$transaction(async (tx) => {
    if (mode === "stable") {
      await tx.ruleset.updateMany({
        where: { storeId: store.id, status: "published" },
        data: { status: "archived" },
      });
    }
    await tx.ruleset.update({
      where: { id: ruleset.id },
      data: { status: newStatus },
    });
    const dep = await tx.deployment.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        stableVersion: mode === "stable" ? version : null,
        canaryVersion: mode === "canary" ? version : null,
        canaryPercent: mode === "canary" ? canaryPercent : 0,
      },
      update:
        mode === "stable"
          ? {
              stableVersion: version,
              canaryVersion: null,
              canaryPercent: 0,
            }
          : {
              canaryVersion: version,
              canaryPercent,
            },
    });
    void dep;
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: mode === "stable" ? "ruleset.publish" : "ruleset.canary",
    entity: "Ruleset",
    entityId: ruleset.id,
    meta: { version, canaryPercent: mode === "canary" ? canaryPercent : 0 },
  });
  revalidatePath(`/s/${slug}/rules`);
  revalidatePath(`/s/${slug}`);
}

export async function rollbackToVersion(slug: string, version: number) {
  await publishRuleset(slug, version, "stable");
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ruleset.rollback",
    entity: "Ruleset",
    meta: { version },
  });
}

export async function setCanaryPercent(slug: string, percent: number) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const p = Math.max(0, Math.min(100, Math.floor(percent)));
  await prisma.deployment.update({
    where: { storeId: store.id },
    data: { canaryPercent: p },
  });
  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "deployment.canary_percent",
    meta: { percent: p },
  });
  revalidatePath(`/s/${slug}/rules`);
}

/**
 * Takes a single rule out of service without editing any version.
 *
 * A rule's own `enabled` flag lives inside a ruleset, so flipping it means
 * producing and publishing a new version — too slow when a rule is actively
 * causing harm, and it rewrites the record of what was live. This is the
 * operational override instead: immediate, reversible, and audited.
 */
export async function setRuleKilled(
  slug: string,
  ruleKey: unknown,
  killed: unknown,
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");

  const key = z.string().trim().min(1).max(120).safeParse(ruleKey);
  if (!key.success) throw new Error("Cheie de regulă invalidă");
  if (typeof killed !== "boolean") throw new Error("Valoare invalidă");

  const current = new Set(parseStringArray(store.killedRuleKeys));
  if (killed) current.add(key.data);
  else current.delete(key.data);

  await prisma.store.update({
    where: { id: store.id },
    data: { killedRuleKeys: [...current] },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: killed ? "killswitch.rule_killed" : "killswitch.rule_restored",
    entity: "Rule",
    entityId: key.data,
    meta: { ruleKey: key.data },
  });

  revalidatePath(`/s/${slug}/rules`);
  revalidatePath(`/s/${slug}`);
}

/**
 * Refuses a ruleset version at resolution time.
 *
 * Killing the stable version leaves decisions with no rules at all, which is the
 * intended blast radius: stop serving it now, rather than silently falling back
 * to a version nobody chose. Killing a canary falls back to stable.
 */
export async function setVersionKilled(
  slug: string,
  version: unknown,
  killed: unknown,
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");

  const parsed = z.number().int().positive().safeParse(version);
  if (!parsed.success) throw new Error("Versiune invalidă");
  if (typeof killed !== "boolean") throw new Error("Valoare invalidă");

  const current = new Set(parseNumberArray(store.killedVersions));
  if (killed) current.add(parsed.data);
  else current.delete(parsed.data);

  await prisma.store.update({
    where: { id: store.id },
    data: { killedVersions: [...current] },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: killed ? "killswitch.version_killed" : "killswitch.version_restored",
    entity: "Ruleset",
    meta: { version: parsed.data },
  });

  revalidatePath(`/s/${slug}/rules`);
  revalidatePath(`/s/${slug}`);
}

export async function setKillSwitch(
  slug: string,
  opts: {
    killAll?: boolean;
    categories?: Partial<Record<DecisionType, boolean>>;
  },
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const current =
    (store.killSwitchCategories as Record<string, boolean>) ?? {};
  await prisma.store.update({
    where: { id: store.id },
    data: {
      killSwitchEnabled: opts.killAll ?? store.killSwitchEnabled,
      killSwitchCategories: opts.categories
        ? { ...current, ...opts.categories }
        : current,
    },
  });
  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "killswitch.update",
    meta: opts,
  });
  revalidatePath(`/s/${slug}/rules`);
  revalidatePath(`/s/${slug}`);
}

export async function toggleRuleEnabled(
  slug: string,
  version: number,
  key: string,
  enabled: boolean,
) {
  const { store, authz } = await ctx(slug, "STORE_ADMIN");
  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
  });
  if (!ruleset) throw new Error("Versiune inexistentă");
  // Allow kill on published via enabled flag only on drafts; for published use kill switch.
  if (ruleset.status !== "draft") {
    throw new Error("Dezactivează prin kill switch sau creează un draft nou");
  }
  await prisma.rule.update({
    where: { rulesetId_key: { rulesetId: ruleset.id, key } },
    data: { enabled },
  });
  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "rule.toggle",
    entity: "Rule",
    entityId: key,
    meta: { enabled, version },
  });
  revalidatePath(`/s/${slug}/rules/${version}`);
}
