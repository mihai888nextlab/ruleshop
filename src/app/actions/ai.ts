"use server";

import { revalidatePath } from "next/cache";
import type { RuleDefinition } from "@/engine";
import { validateRule } from "@/engine";
import {
  extractJson,
  kimiChat,
  proposeRuleFromNaturalLanguage,
} from "@/lib/ai";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { simulateRulesetMetrics } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { saveRuleInDraft, createDraftRuleset } from "./rules";

async function ctx(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error("Magazin inexistent");
  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) throw new Error(authz.error);
  return { store, authz };
}

export async function analyzeRulesWithAi(slug: string) {
  const { store, authz } = await ctx(slug);
  const version = store.deployment?.stableVersion;
  if (version == null) throw new Error("Nicio versiune publicată");

  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
    include: { rules: true },
  });
  if (!ruleset) throw new Error("Ruleset lipsă");

  const evaluations = await prisma.evaluation.findMany({
    where: { storeId: store.id, rulesetVersion: version },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  const hitCounts: Record<string, number> = {};
  for (const e of evaluations) {
    for (const k of (e.matchedRules as string[]) ?? []) {
      hitCounts[k] = (hitCounts[k] ?? 0) + 1;
    }
  }

  const unused = ruleset.rules
    .filter((r) => r.enabled && !hitCounts[r.key])
    .map((r) => r.key);

  const stats = {
    evaluationSample: evaluations.length,
    hitCounts,
    unused,
    rules: ruleset.rules.map((r) => ({
      key: r.key,
      name: r.name,
      category: r.category,
      priority: r.priority,
      hits: hitCounts[r.key] ?? 0,
    })),
  };

  let narrative = "";
  let confidence = 0.6;
  try {
    narrative = await kimiChat([
      {
        role: "system",
        content:
          "Ești analist pentru RuleShop. Explică în română regulile neutilizate/redundante și propune îmbunătățiri. Nu publica reguli. Răspunde concis.",
      },
      {
        role: "user",
        content: JSON.stringify(stats),
      },
    ]);
    const conf = extractJson<{ confidence?: number }>(narrative);
    if (conf?.confidence) confidence = conf.confidence;
  } catch (e) {
    narrative =
      e instanceof Error
        ? `Analiză locală (AI indisponibil: ${e.message}). Reguli fără hit-uri: ${unused.join(", ") || "niciuna"}.`
        : "Analiză locală — AI indisponibil.";
  }

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "analyze",
      prompt: "analyze-current-ruleset",
      proposal: { narrative, stats, unused } as object,
      metrics: {
        evaluationSample: evaluations.length,
        unusedCount: unused.length,
      },
      confidence,
      status: "pending",
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.analyze",
    entity: "AiSuggestion",
    entityId: suggestion.id,
  });
  revalidatePath(`/s/${slug}/rules/ai`);
  return suggestion.id;
}

export async function proposeRuleWithAi(
  slug: string,
  prompt: string,
  category?: string,
) {
  const { store, authz } = await ctx(slug);
  let result: Awaited<ReturnType<typeof proposeRuleFromNaturalLanguage>>;
  try {
    result = await proposeRuleFromNaturalLanguage(prompt, category);
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : "Kimi API eșuat — verifică MOONSHOT_API_KEY",
    );
  }

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "nl_rule",
      prompt,
      proposal: {
        rule: result.rule ?? null,
        raw: result.raw,
        errors: result.errors,
        ok: result.ok,
      } as object,
      confidence: result.confidence,
      status: "pending",
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.propose_rule",
    entity: "AiSuggestion",
    entityId: suggestion.id,
  });
  revalidatePath(`/s/${slug}/rules/ai`);
  return suggestion.id;
}

export async function simulateSuggestion(slug: string, suggestionId: string) {
  const { store, authz } = await ctx(slug);
  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id: suggestionId, storeId: store.id },
  });
  if (!suggestion) throw new Error("Sugestie inexistentă");

  const version = store.deployment?.stableVersion;
  if (version == null) throw new Error("Nicio versiune stable");

  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
    include: { rules: true },
  });
  if (!ruleset) throw new Error("Ruleset lipsă");

  const baseRules: RuleDefinition[] = ruleset.rules.map((r) => ({
    key: r.key,
    name: r.name,
    description: r.description,
    category: r.category as RuleDefinition["category"],
    priority: r.priority,
    enabled: r.enabled,
    conditions: r.conditions as RuleDefinition["conditions"],
    actions: r.actions as RuleDefinition["actions"],
  }));

  const proposal = suggestion.proposal as {
    rule?: RuleDefinition;
    ok?: boolean;
  };
  const candidate = [...baseRules];
  if (proposal.rule) {
    const v = validateRule(proposal.rule);
    if (v.ok && v.data) {
      const idx = candidate.findIndex((r) => r.key === v.data!.key);
      if (idx >= 0) candidate[idx] = v.data;
      else candidate.push(v.data);
    }
  }

  const historical = await prisma.evaluation.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { decisionType: true, context: true },
  });

  const currentMetrics = simulateRulesetMetrics(historical, baseRules);
  const candidateMetrics = simulateRulesetMetrics(historical, candidate);

  let narrative = "";
  try {
    narrative = await kimiChat([
      {
        role: "system",
        content:
          "Compară metricile current vs candidate în română. Nu inventa cifre — folosește doar JSON-ul dat.",
      },
      {
        role: "user",
        content: JSON.stringify({ currentMetrics, candidateMetrics }),
      },
    ]);
  } catch {
    narrative = "Comparație locală (fără narațiune AI).";
  }

  await prisma.aiSuggestion.update({
    where: { id: suggestion.id },
    data: {
      metrics: { currentMetrics, candidateMetrics, narrative } as object,
    },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.simulate",
    entity: "AiSuggestion",
    entityId: suggestion.id,
  });
  revalidatePath(`/s/${slug}/rules/ai`);
}

export async function reviewSuggestion(
  slug: string,
  suggestionId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  const { store, authz } = await ctx(slug);
  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id: suggestionId, storeId: store.id },
  });
  if (!suggestion) throw new Error("Sugestie inexistentă");

  if (decision === "rejected") {
    await prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: "rejected", reviewNote: note },
    });
    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "ai.reject",
      entity: "AiSuggestion",
      entityId: suggestionId,
    });
    revalidatePath(`/s/${slug}/rules/ai`);
    return { published: false };
  }

  // Human approve → apply to a NEW draft only (never auto-publish)
  const proposal = suggestion.proposal as {
    rule?: RuleDefinition;
    ok?: boolean;
  };

  await prisma.aiSuggestion.update({
    where: { id: suggestionId },
    data: { status: "approved", reviewNote: note },
  });

  if (proposal.rule) {
    const draft = await createDraftRuleset(slug, {
      fromVersion: store.deployment?.stableVersion ?? undefined,
      name: `AI draft from ${suggestionId.slice(0, 6)}`,
    });
    await saveRuleInDraft(slug, draft.version, proposal.rule);
    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "ai.approve_to_draft",
      entity: "AiSuggestion",
      entityId: suggestionId,
      meta: { draftVersion: draft.version },
    });
    revalidatePath(`/s/${slug}/rules/ai`);
    revalidatePath(`/s/${slug}/rules`);
    return { published: false, draftVersion: draft.version };
  }

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.approve",
    entity: "AiSuggestion",
    entityId: suggestionId,
  });
  revalidatePath(`/s/${slug}/rules/ai`);
  return { published: false };
}
