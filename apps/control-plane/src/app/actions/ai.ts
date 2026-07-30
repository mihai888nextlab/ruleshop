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
  classifyFraudIncidents,
  explainDiff,
  isAiConfigured,
  narrateAnalysis,
  narrateSimulation,
  proposeImprovement,
  proposeRuleFromNaturalLanguage,
  type ModelCall,
} from "@/lib/ai";
import { assessAnalysis, assessRuleProposal } from "@/lib/ai-trust";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { loadContextSchema, loadEditorSchema } from "@/lib/context-schema";
import { toRuleDefs } from "@/lib/decide";
import { computeFraudStats } from "@/lib/fraud-analysis";
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
/**
 * Contexts replayed for per-rule impact.
 *
 * Impact costs one replay of the window per rule, so this is capped below the
 * history limit: a smaller window measured promptly is more useful to a rule
 * author than a larger one that makes the page hang.
 */
const IMPACT_LIMIT = 300;

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

async function loadHistory(
  storeId: string,
  limit: number = HISTORY_LIMIT,
): Promise<HistoricalEvaluation[]> {
  const rows = await prisma.evaluation.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: limit,
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

  const [evaluations, history] = await Promise.all([
    loadMatchHistory(store.id, version),
    loadHistory(store.id, IMPACT_LIMIT),
  ]);

  // History is passed as well as match counts, so every rule is also replayed out
  // of the ruleset to see what it is actually worth.
  const analysis = analyzeRuleset({ rules, evaluations, schema, history });
  const narrative = await narrateAnalysis(analysis);
  const trust = assessAnalysis({
    sampleSize: analysis.sampleSize,
    replaySampleSize: analysis.replaySampleSize,
  });

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "analysis",
      prompt: `analyze:v${version}`,
      proposal: {
        narrative: narrative.ok ? narrative.data : null,
        narrativeError: narrative.ok ? null : narrative.error,
        trust: trust as unknown as object,
      },
      analysis: analysis as unknown as object,
      metrics: {
        sampleSize: analysis.sampleSize,
        counts: analysis.counts,
      },
      // The application's own assessment of how well evidenced this is. The model
      // is not asked how confident it feels.
      confidence: trust.score,
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
      replaySampleSize: analysis.replaySampleSize,
      trustScore: trust.score,
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

  // A new rule is additive, so the candidate ruleset is the live one plus this
  // rule. Measured here rather than on request: a proposal shown without its
  // effect invites approval on the strength of the prose alone.
  let simulation: ReturnType<typeof simulateChange> | null = null;
  if (result.ok) {
    const history = await loadHistory(store.id);
    if (history.length > 0) {
      simulation = simulateChange(history, rules, [...rules, result.data.rule]);
    }
  }

  const trust = result.ok
    ? assessRuleProposal({
        schemaValid: true,
        simulation,
        modelClaim: result.data.confidence,
      })
    : null;

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
            // The model's own figure, kept as a claim and never as the score.
            modelConfidence: result.data.confidence,
            trust: trust as unknown as object,
          }
        : { rule: null, error: result.error },
      metrics: (simulation as unknown as object) ?? undefined,
      confidence: trust?.score ?? null,
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
      trustScore: trust?.score ?? null,
      modelClaim: result.ok ? result.data.confidence : null,
      sampleAdequacy: simulation?.sampleAdequacy ?? null,
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
  revalidatePath(`/s/${slug}/rules/diff`);
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

  const [evaluations, history] = await Promise.all([
    loadMatchHistory(store.id, version),
    loadHistory(store.id),
  ]);

  const analysis = analyzeRuleset({
    rules,
    evaluations,
    schema,
    history: history.slice(0, IMPACT_LIMIT),
  });

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
    impact: analysis.impacts.find((i) => i.key === rule.key) ?? null,
    schema,
  });

  // Measured before anyone is shown a recommendation: the candidate ruleset is
  // the live one with this rule replaced.
  let simulation: ReturnType<typeof simulateChange> | null = null;
  if (result.ok && history.length > 0) {
    const candidate = rules.map((r) =>
      r.key === rule.key ? result.data.rule : r,
    );
    simulation = simulateChange(history, rules, candidate);
  }

  const trust = result.ok
    ? assessRuleProposal({
        schemaValid: true,
        simulation,
        modelClaim: result.data.confidence,
      })
    : null;

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
            modelConfidence: result.data.confidence,
            trust: trust as unknown as object,
          }
        : { rule: null, error: result.error },
      analysis: {
        findings: analysis.findings.filter((f) => f.key === rule.key),
        usage,
        impact: analysis.impacts.find((i) => i.key === rule.key) ?? null,
      } as unknown as object,
      metrics: simulation as unknown as object,
      confidence: trust?.score ?? null,
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
      trustScore: trust?.score ?? null,
      modelClaim: result.ok ? result.data.confidence : null,
      sampleAdequacy: simulation?.sampleAdequacy ?? null,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  if (!result.ok) throw new Error(result.error);
  return { id: suggestion.id };
}

/**
 * Replays a whole candidate version against the live one.
 *
 * This is the shape §6 of the brief actually asks for: not "is this one rule
 * better", but "what would publishing this version do". A draft can add, remove
 * and reorder rules at once, and the interactions between those changes are
 * exactly what a per-rule check cannot see.
 *
 * Needs no API key. The comparison is arithmetic over replayed decisions; the
 * model is asked afterwards to put the result into words, and its absence costs
 * only the prose.
 */
export async function simulateVersion(slug: string, rawVersion: unknown) {
  const { store, authz } = await adminContext(slug);

  const candidateVersion = z
    .number()
    .int()
    .positive()
    .safeParse(Number(rawVersion));
  if (!candidateVersion.success) throw new Error("Versiune invalidă");

  const [{ version: liveVersion, rules: liveRules }, candidateRuleset, history] =
    await Promise.all([
      loadLiveRules(store.id),
      prisma.ruleset.findUnique({
        where: {
          storeId_version: { storeId: store.id, version: candidateVersion.data },
        },
        include: { rules: true },
      }),
      loadHistory(store.id),
    ]);

  if (!candidateRuleset) throw new Error("Versiune inexistentă");
  if (history.length === 0) {
    throw new Error(
      "Nu există evaluări înregistrate pe care să se poată face simularea",
    );
  }
  if (candidateVersion.data === liveVersion) {
    throw new Error(
      "Versiunea selectată este deja publicată; nu există nimic de comparat",
    );
  }

  const candidateRules = toRuleDefs(candidateRuleset.rules);
  const simulation = simulateChange(history, liveRules, candidateRules);

  const label =
    liveVersion == null
      ? `Versiunea candidat v${candidateVersion.data} față de niciun set publicat`
      : `Versiunea candidat v${candidateVersion.data} față de v${liveVersion} (publicată)`;

  const narrative = await narrateSimulation({ label, simulation });

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "version_simulation",
      prompt: `simulate:v${candidateVersion.data} vs v${liveVersion ?? "none"}`,
      proposal: {
        narrative: narrative.ok ? narrative.data : null,
        narrativeError: narrative.ok ? null : narrative.error,
      },
      analysis: {
        candidateVersion: candidateVersion.data,
        liveVersion,
        candidateRuleCount: candidateRules.length,
        liveRuleCount: liveRules.length,
      } as unknown as object,
      metrics: simulation as unknown as object,
      // A simulation is a measurement, so its trustworthiness is the adequacy of
      // the sample it ran on and nothing else.
      confidence:
        simulation.sampleAdequacy === "reasonable"
          ? 1
          : simulation.sampleAdequacy === "indicative"
            ? 0.5
            : 0.2,
      status: "pending",
      ...traceFields(narrative.call),
    },
    select: { id: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "ai.simulate_version",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      candidateVersion: candidateVersion.data,
      liveVersion,
      sampleSize: history.length,
      sampleAdequacy: simulation.sampleAdequacy,
      revenueDelta:
        simulation.candidate.grossRevenue - simulation.current.grossRevenue,
      discountCostDelta:
        simulation.candidate.discountCost - simulation.current.discountCost,
      blockedDelta:
        simulation.candidate.blockedCount - simulation.current.blockedCount,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  revalidatePath(`/s/${slug}/rules/${candidateVersion.data}`);
  return {
    id: suggestion.id,
    sampleAdequacy: simulation.sampleAdequacy,
  };
}

/**
 * Triages the checkouts the fraud rules refused.
 *
 * The statistics — block rate, value refused, which rule refused what, and which
 * refused customers have already paid for orders here — are computed from the
 * order table. The model receives them read-only and contributes one label from a
 * closed set per incident. It cannot invent an order: ids outside the list are
 * dropped and reported.
 *
 * This is the AI feature that touches the shop rather than the rule editor, which
 * is why it starts from real refusals instead of from a ruleset.
 */
export async function triageFraudIncidents(slug: string) {
  const { store, authz } = await adminContext(slug);

  const stats = await computeFraudStats(store.id);
  const triage = await classifyFraudIncidents({ stats });

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      storeId: store.id,
      userId: authz.session.user.id,
      kind: "fraud_triage",
      prompt: `fraud:${stats.windowDays}d`,
      proposal: triage.ok
        ? {
            narrative: triage.data.summary,
            recommendation: triage.data.recommendation,
            classifications:
              triage.data.classifications as unknown as object[],
            dropped: triage.data.dropped,
          }
        : { classifications: [], error: triage.error },
      // Statistics stay in the column reserved for what the application computed.
      analysis: stats as unknown as object,
      metrics: {
        blocked: stats.blocked,
        blockRate: stats.blockRate,
        blockedValue: stats.blockedValue,
        suspectedFalsePositives: stats.suspectedFalsePositives,
      },
      // Reflects the evidence, not the model: how many of the real incidents it
      // managed to classify.
      confidence: triage.ok
        ? Math.round(
            (triage.data.classifications.length / stats.incidents.length) * 100,
          ) / 100
        : null,
      status: triage.ok ? "pending" : "rejected",
      reviewNote: triage.ok ? null : triage.error,
      ...traceFields(triage.call),
    },
    select: { id: true },
  });

  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: triage.ok ? "ai.fraud_triage" : "ai.fraud_triage_failed",
    entity: "AiSuggestion",
    entityId: suggestion.id,
    meta: {
      windowDays: stats.windowDays,
      checkouts: stats.checkouts,
      blocked: stats.blocked,
      classified: triage.ok ? triage.data.classifications.length : 0,
      dropped: triage.ok ? triage.data.dropped.length : 0,
      model: triage.call?.model ?? null,
      error: triage.ok ? null : triage.error,
    },
  });

  revalidatePath(`/s/${slug}/rules/ai`);
  if (!triage.ok) throw new Error(triage.error);
  return { id: suggestion.id, classified: triage.data.classifications.length };
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

  // The trust score is a function of the measurement, so re-measuring has to
  // re-score: leaving the old number next to new figures would be misleading.
  const existing = suggestion.proposal as {
    modelConfidence?: unknown;
    [key: string]: unknown;
  };
  const modelClaim =
    typeof existing?.modelConfidence === "number"
      ? existing.modelConfidence
      : null;
  const trust = assessRuleProposal({
    schemaValid: true,
    simulation,
    modelClaim,
  });

  await prisma.aiSuggestion.update({
    where: { id: suggestion.id },
    data: {
      metrics: simulation as unknown as object,
      confidence: trust.score,
      proposal: {
        ...existing,
        trust: trust as unknown as object,
      } as unknown as object,
    },
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
      trustScore: trust.score,
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
