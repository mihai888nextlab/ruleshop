import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type {
  RuleFinding,
  RuleUsage,
  SimulationResult,
} from "@ruleshop/engine";
import {
  analyzeLiveRuleset,
  explainVersionDiff,
  proposeRuleFromText,
  proposeRuleImprovement,
  reviewSuggestion,
  simulateSuggestion,
} from "@/app/actions/ai";
import { AiConsole } from "@/components/ai/ai-console";
import type { SuggestionView } from "@/components/ai/suggestion-card";
import { requireStoreRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

/**
 * AI module screen.
 *
 * Reads are shaped here so the client component receives plain data. Suggestions
 * carry both the application's computed findings and the model's prose, kept as
 * separate fields on purpose — a reviewer has to be able to tell evidence from
 * opinion.
 */
export default async function AiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/ai`);

  const liveVersion = store.deployment?.stableVersion ?? null;

  const [rows, versionRows, liveRuleset] = await Promise.all([
    prisma.aiSuggestion.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.ruleset.findMany({
      where: { storeId: store.id },
      select: { version: true },
      orderBy: { version: "desc" },
    }),
    liveVersion != null
      ? prisma.ruleset.findUnique({
          where: {
            storeId_version: { storeId: store.id, version: liveVersion },
          },
          include: { rules: { select: { key: true } } },
        })
      : null,
  ]);

  const suggestions: SuggestionView[] = rows.map((row) => {
    const proposal = (row.proposal ?? {}) as Record<string, unknown>;
    const analysis = (row.analysis ?? {}) as Record<string, unknown>;

    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      prompt: row.prompt,
      createdAt: row.createdAt.toISOString(),
      confidence: row.confidence,
      reviewNote: row.reviewNote,
      targetRuleKey: row.targetRuleKey,

      model: row.model,
      promptVersion: row.promptVersion,
      latencyMs: row.latencyMs,
      tokensPrompt: row.tokensPrompt,
      tokensOutput: row.tokensOutput,
      rawResponse: row.rawResponse,

      narrative:
        typeof proposal.narrative === "string"
          ? proposal.narrative
          : typeof proposal.explanation === "string"
            ? proposal.explanation
            : null,
      narrativeError:
        typeof proposal.narrativeError === "string"
          ? proposal.narrativeError
          : typeof proposal.error === "string"
            ? proposal.error
            : null,
      reasoning:
        typeof proposal.reasoning === "string" ? proposal.reasoning : null,
      rule: proposal.rule ?? null,
      before: proposal.before ?? null,

      findings: Array.isArray(analysis.findings)
        ? (analysis.findings as RuleFinding[])
        : [],
      usage:
        analysis.usage && typeof analysis.usage === "object"
          ? (analysis.usage as RuleUsage)
          : null,
      simulation:
        row.metrics && typeof row.metrics === "object" && "deltas" in row.metrics
          ? (row.metrics as unknown as SimulationResult)
          : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
          ← Control plane
        </Link>
        <h1 className="display text-3xl">Asistent AI</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Constatările și cifrele de pe această pagină sunt calculate de
          aplicație prin reluarea evaluărilor reale. Modelul este folosit doar
          pentru a le explica și pentru a propune reguli structurate, care sunt
          validate înainte de a fi arătate. Nicio regulă propusă nu ajunge la
          clienți fără o publicare separată, făcută de un om.
        </p>
      </div>

      <AiConsole
        aiConfigured={isAiConfigured()}
        suggestions={suggestions}
        liveRuleKeys={liveRuleset?.rules.map((rule) => rule.key) ?? []}
        versions={versionRows.map((row) => row.version)}
        liveVersion={liveVersion}
        actions={{
          analyze: analyzeLiveRuleset.bind(null, slug),
          propose: proposeRuleFromText.bind(null, slug) as (
            prompt: string,
            category: string,
          ) => Promise<unknown>,
          improve: proposeRuleImprovement.bind(null, slug),
          explainDiff: explainVersionDiff.bind(null, slug) as (
            from: number,
            to: number,
          ) => Promise<unknown>,
          simulate: simulateSuggestion.bind(null, slug),
          review: reviewSuggestion.bind(null, slug) as (
            id: string,
            decision: "approved" | "rejected",
            note?: string,
          ) => Promise<unknown>,
        }}
      />
    </div>
  );
}
