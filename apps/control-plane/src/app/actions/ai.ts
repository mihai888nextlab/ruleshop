"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  analyzeRuleset,
  diffRulesets,
  simulateChange,
  type HistoricalEvaluation,
  type RuleDefinition,
} from "@ruleshop/engine";
import {
  PROMPT_VERSION,
  explainDiff,
  isAiConfigured,
  narrateAnalysis,
  proposeImprovement,
  proposeRuleFromNaturalLanguage,
  type ModelCall,
} from "@/lib/ai";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { loadContextSchema, loadEditorSchema } from "@/lib/context-schema";
import { toRuleDefs } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { createDraftRuleset, saveRuleInDraft } from "./rules";

/**
 * AI module actions.
 *
 * The division of labour is deliberate and load-bearing: this application
 * computes every finding and every statistic, and the model is asked only to
 * explain them or to propose a structured change that is then validated and
 * simulated. Nothing the model returns is ever published — approval creates a
 * draft, and publishing stays a separate, human act.
 */

const HISTORY_LIMIT = 500;
/** Sample size at which the analysis is treated as fully evidenced. */
const CONFIDENT_SAMPLE = 200;

async function adminContext(slug: unknown) {
  const parsed = z.string().trim().min(1).max(80).safeParse(slug);
  if (!parsed.success) throw new Error("Magazin invalid");

  const store = await getStoreBySlug(parsed.data);
  if (!store) throw new Error("Magazin inexistent");

  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) throw new Error(authz.error);

  return { store, authz, slug: parsed.data };
}

/** Trace columns recorded for every AI evaluation, successful or not. */
function traceFields(call: ModelCall | null) {
  return {
    promptVersion: PROMPT_VERSION,
    model: call?.model ?? null,
    latencyMs: call?.latencyMs ?? null,
    tokensPrompt: call?.tokensPrompt ?? null,
    tokensOutput: call?.tokensOutput ?? null,
    rawResponse: call?.content || null,
  };
}

async function loadLiveRules(storeId: string): Promise<{
  version: number | null;
  rules: RuleDefinition[];
}> {
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    include: { deployment: true },
  });

  const version = store.deployment?.stableVersion ?? null;
  if (version == null) return { version: null, rules: [] };

  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId, version } },
    include: { rules: true },
  });

  return { version, rules: ruleset ? toRuleDefs(ruleset.rules) : [] };
}

async function loadHistory(storeId: string): Promise<HistoricalEvaluation[]> {
  const rows = await prisma.evaluation.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { decisionType: true, context: true },
  });

  return rows.map((row) => ({
    decisionType: row.decisionType,
    context: (row.context ?? {}) as Record<string, unknown>,
  }));
}

function matchedKeysOf(raw: unknown): string[] {
  return Array.isArray(raw)
    ? (raw as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
}

async function loadMatchHistory(storeId: string, version: number | null) {
  const rows = await prisma.evaluation.findMany({
    where: { storeId, rulesetVersion: version ?? undefined },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { matchedRules: true },
  });
  return rows.map((row) => ({ matchedRules: matchedKeysOf(row.matchedRules) }));
}

/**
 * Analyses the live ruleset.
 *
 * Findings and usage statistics are computed here and stored separately from the
 * model's prose, so the two can never be mistaken for one another. Works fully
 * without an API key — only the narrative is lost.
 */
export async function analyzeLiveRuleset(slug: string) {
  const { store, authz } = await adminContext(slug);

  const [{ version, rules }, schema] = await Promise.all([
    loadLiveRules(store.id),
    loadContextSchema(store.id),
  ]);

  if (version == null || rules.length === 0) {
    throw new Error("Nu există o versiune publicată de analizat");
  }

  const evaluations = await loadMatchHistory(store.id, version);

  const analysis = analyzeRuleset({ rules, evaluations, schema });
  const narrative = await narrateAnalysis(analysis);

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "analysis",
      prompt: `analyze:v${version}`,
      proposal: {
        narrative: narrative.ok ? narrative.data : null,
        narrativeError: narrative.ok ? null : narrative.error,
      },
      analysis: analysis as unknown as object,
      metrics: {
        sampleSize: analysis.sampleSize,
        counts: analysis.counts,
      },
      // Not the model's claim: this reflects how much evidence the sample gives.
      confidence: Math.min(1, analysis.sampleSize / CONFIDENT_SAMPLE),
      status: "pending",
      ...traceFields(narrative.call),
    },
    select: { id: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.analyze",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      version,
      findings: analysis.findings.length,
      sampleSize: analysis.sampleSize,
      model: narrative.call?.model ?? null,
      aiAvailable: isAiConfigured(),
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  return { id: suggestion.id, findings: analysis.findings.length };
}

/** Turns a requirement in plain language into a validated candidate rule. */
export async function proposeRuleFromText(
  slug: string,
  rawPrompt: unknown,
  rawCategory: unknown,
) {
  const { store, authz } = await adminContext(slug);

  const prompt = z.string().trim().min(8).max(1000).safeParse(rawPrompt);
  if (!prompt.success) {
    throw new Error("Descrie cerința în minim 8 caractere");
  }

  const category = z
    .enum(["pricing", "shipping", "fraud", "availability", "loyalty", "theme"])
    .safeParse(rawCategory);
  if (!category.success) throw new Error("Tip de decizie invalid");

  const [{ rules }, schema] = await Promise.all([
    loadLiveRules(store.id),
    loadEditorSchema(store.id),
  ]);

  const result = await proposeRuleFromNaturalLanguage({
    prompt: prompt.data,
    category: category.data,
    schema,
    existingKeys: rules.map((rule) => rule.key),
  });

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "nl_rule",
      prompt: prompt.data,
      proposal: result.ok
        ? {
            rule: result.data.rule as unknown as object,
            reasoning: result.data.reasoning,
          }
        : { rule: null, error: result.error },
      confidence: result.ok ? result.data.confidence : null,
      // A failed proposal is still recorded: a rejected suggestion belongs in the
      // audit trail rather than being hidden.
      status: result.ok ? "pending" : "rejected",
      reviewNote: result.ok ? null : result.error,
      targetRuleKey: result.ok ? result.data.rule.key : null,
      ...traceFields(result.call),
    },
    select: { id: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: result.ok ? "ai.propose_rule" : "ai.propose_rule_failed",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      category: category.data,
      model: result.call?.model ?? null,
      latencyMs: result.call?.latencyMs ?? null,
      error: result.ok ? null : result.error,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  if (!result.ok) throw new Error(result.error);
  return { id: suggestion.id };
}

/** Natural-language explanation of what publishing a version would change. */
export async function explainVersionDiff(
  slug: string,
  rawFrom: unknown,
  rawTo: unknown,
) {
  const { store, authz } = await adminContext(slug);

  const versions = z
    .object({
      from: z.number().int().positive(),
      to: z.number().int().positive(),
    })
    .safeParse({ from: Number(rawFrom), to: Number(rawTo) });
  if (!versions.success) throw new Error("Versiuni invalide");

  const [from, to, schema] = await Promise.all([
    prisma.ruleset.findUnique({
      where: {
        storeId_version: { storeId: store.id, version: versions.data.from },
      },
      include: { rules: true },
    }),
    prisma.ruleset.findUnique({
      where: {
        storeId_version: { storeId: store.id, version: versions.data.to },
      },
      include: { rules: true },
    }),
    loadContextSchema(store.id),
  ]);

  if (!from || !to) throw new Error("Versiune inexistentă");

  const diffs = diffRulesets(
    toRuleDefs(from.rules),
    toRuleDefs(to.rules),
    schema,
  );

  const explanation = await explainDiff({
    fromVersion: versions.data.from,
    toVersion: versions.data.to,
    diffs,
    schema,
  });

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "diff_explanation",
      prompt: `diff:v${versions.data.from}->v${versions.data.to}`,
      proposal: {
        explanation: explanation.ok ? explanation.data : null,
        error: explanation.ok ? null : explanation.error,
      },
      analysis: {
        changed: diffs.filter((d) => d.kind !== "unchanged").length,
      } as unknown as object,
      status: "pending",
      ...traceFields(explanation.call),
    },
    select: { id: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.explain_diff",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: { from: versions.data.from, to: versions.data.to },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  if (!explanation.ok) throw new Error(explanation.error);
  return { id: suggestion.id };
}

/** Asks for a revision of a flagged rule, then measures it against history. */
export async function proposeRuleImprovement(slug: string, rawRuleKey: unknown) {
  const { store, authz } = await adminContext(slug);

  const ruleKey = z.string().trim().min(1).max(120).safeParse(rawRuleKey);
  if (!ruleKey.success) throw new Error("Cheie de regulă invalidă");

  const [{ version, rules }, schema] = await Promise.all([
    loadLiveRules(store.id),
    loadEditorSchema(store.id),
  ]);

  const rule = rules.find((r) => r.key === ruleKey.data);
  if (!rule) throw new Error("Regula nu există în versiunea publicată");

  const evaluations = await loadMatchHistory(store.id, version);
  const analysis = analyzeRuleset({ rules, evaluations, schema });

  const usage =
    analysis.usage.find((u) => u.key === rule.key) ?? {
      key: rule.key,
      matched: 0,
      won: 0,
    };

  const result = await proposeImprovement({
    rule,
    findings: analysis.findings.filter((f) => f.key === rule.key),
    usage,
    schema,
  });

  // Measured before anyone is shown a recommendation: the candidate ruleset is
  // the live one with this rule replaced.
  let simulation: ReturnType<typeof simulateChange> | null = null;
  if (result.ok) {
    const history = await loadHistory(store.id);
    const candidate = rules.map((r) =>
      r.key === rule.key ? result.data.rule : r,
    );
    simulation = simulateChange(history, rules, candidate);
  }

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "improvement",
      prompt: `improve:${rule.key}`,
      proposal: result.ok
        ? {
            rule: result.data.rule as unknown as object,
            reasoning: result.data.reasoning,
            before: rule as unknown as object,
          }
        : { rule: null, error: result.error },
      analysis: {
        findings: analysis.findings.filter((f) => f.key === rule.key),
        usage,
      } as unknown as object,
      metrics: simulation as unknown as object,
      confidence: result.ok ? result.data.confidence : null,
      status: result.ok ? "pending" : "rejected",
      reviewNote: result.ok ? null : result.error,
      targetRuleKey: rule.key,
      ...traceFields(result.call),
    },
    select: { id: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: result.ok
      ? "ai.propose_improvement"
      : "ai.propose_improvement_failed",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      ruleKey: rule.key,
      model: result.call?.model ?? null,
      sampleAdequacy: simulation?.sampleAdequacy ?? null,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  if (!result.ok) throw new Error(result.error);
  return { id: suggestion.id };
}

/**
 * Replays a suggested rule against recorded history.
 *
 * Offered on demand as well as automatically, because the live ruleset moves: a
 * simulation run last week was measured against rules that may since have changed.
 */
export async function simulateSuggestion(slug: string, rawId: unknown) {
  const { store, authz } = await adminContext(slug);

  const id = z.string().trim().min(1).max(60).safeParse(rawId);
  if (!id.success) throw new Error("Identificator invalid");

  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id: id.data, storeId: store.id },
  });
  if (!suggestion) throw new Error("Sugestie inexistentă");

  const proposal = suggestion.proposal as { rule?: RuleDefinition | null };
  const candidateRule = proposal?.rule;
  if (!candidateRule) {
    throw new Error("Această sugestie nu conține o regulă de simulat");
  }

  const [{ rules }, history] = await Promise.all([
    loadLiveRules(store.id),
    loadHistory(store.id),
  ]);

  const candidate = rules.some((r) => r.key === candidateRule.key)
    ? rules.map((r) => (r.key === candidateRule.key ? candidateRule : r))
    : [...rules, candidateRule];

  const simulation = simulateChange(history, rules, candidate);

  await prisma.aiSuggestion.update({
    where: { id: suggestion.id },
    data: { metrics: simulation as unknown as object },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.simulate",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      sampleSize: history.length,
      sampleAdequacy: simulation.sampleAdequacy,
      revenueDelta:
        simulation.candidate.grossRevenue - simulation.current.grossRevenue,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  return { sampleAdequacy: simulation.sampleAdequacy };
}

/**
 * Human review. Approval creates a draft and never publishes.
 *
 * This is the hard requirement the whole module is built around: no rule the AI
 * touched reaches customers without a person publishing it deliberately, as a
 * separate act, from the normal rules screen.
 */
export async function reviewSuggestion(
  slug: string,
  rawId: unknown,
  rawDecision: unknown,
  rawNote?: unknown,
) {
  const { store, authz } = await adminContext(slug);

  const id = z.string().trim().min(1).max(60).safeParse(rawId);
  if (!id.success) throw new Error("Identificator invalid");

  const decision = z.enum(["approved", "rejected"]).safeParse(rawDecision);
  if (!decision.success) throw new Error("Decizie invalidă");

  const note = z.string().trim().max(500).optional().safeParse(rawNote);
  const reviewNote = note.success ? note.data : undefined;

  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id: id.data, storeId: store.id },
  });
  if (!suggestion) throw new Error("Sugestie inexistentă");
  if (suggestion.status !== "pending") {
    throw new Error("Sugestia a fost deja analizată");
  }

  if (decision.data === "rejected") {
    await prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "rejected", reviewNote: reviewNote ?? null },
    });

    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "ai.rejected",
      entity: "AiSuggestion",
      entityId: suggestion.id,
      meta: { note: reviewNote ?? null },
    });

    revalidatePath(`/s/${slug}/rules/ai`);
    return { published: false as const, draftVersion: null };
  }

  const proposal = suggestion.proposal as { rule?: RuleDefinition | null };

  await prisma.aiSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "approved", reviewNote: reviewNote ?? null },
  });

  // Analyses and diff explanations carry no rule: acknowledging them produces
  // nothing to publish.
  if (!proposal?.rule) {
    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "ai.acknowledged",
      entity: "AiSuggestion",
      entityId: suggestion.id,
    });
    revalidatePath(`/s/${slug}/rules/ai`);
    return { published: false as const, draftVersion: null };
  }

  const { version } = await loadLiveRules(store.id);
  const draft = await createDraftRuleset(slug, {
    fromVersion: version ?? undefined,
    name: `Draft din sugestia AI ${suggestion.id.slice(0, 6)}`,
  });

  // Goes through the same validation path as a hand-written rule; an AI origin
  // buys no exemption.
  await saveRuleInDraft(slug, draft.version, proposal.rule);

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.approved_to_draft",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      draftVersion: draft.version,
      ruleKey: proposal.rule.key,
      note: reviewNote ?? null,
      // Recorded explicitly so the trail shows approval did not publish.
      published: false,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  revalidatePath(`/s/${slug}/rules`);
  return { published: false as const, draftVersion: draft.version };
}
