import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  analyzeRuleset,
  type Action,
  type Condition,
  type DecisionType,
  type HistoricalEvaluation,
  type SimulationResult,
} from "@ruleshop/engine";
import { simulateVersion } from "@/app/actions/ai";
import { deleteRuleFromDraft, saveRuleInDraft } from "@/app/actions/rules";
import {
  FindingsList,
  ImpactTable,
  SimulationTable,
} from "@/components/ai/insight-panels";
import { SimulateVersionButton } from "@/components/ai/simulate-version-button";
import { PageHeader } from "@/components/dashboard/shell";
import { RulesInVersionList } from "@/components/lists/rules-in-version-list";
import { RuleEditorPanel } from "@/components/rule-builder/rule-editor-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireStoreRole } from "@/lib/auth";
import { loadContextSchema, loadStoreAttributes, toFieldDef } from "@/lib/context-schema";
import { toRuleDefs } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { themeKeysFor } from "@/lib/theme-service";

/** Contexts replayed to measure each rule in this version. */
const IMPACT_LIMIT = 300;

export default async function RulesetDetailPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version: versionStr } = await params;
  const version = Number(versionStr);
  if (!Number.isInteger(version) || version < 1) notFound();

  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/${version}`);

  const ruleset = await prisma.ruleset.findUnique({
    where: { storeId_version: { storeId: store.id, version } },
    include: { rules: { orderBy: [{ category: "asc" }, { priority: "desc" }] } },
  });
  if (!ruleset) notFound();

  const editable = ruleset.status === "draft";
  const defs = await loadStoreAttributes(store.id);
  const customFields = defs.map(toFieldDef);
  const themeKeys = await themeKeysFor(store.id);

  const liveVersion = store.deployment?.stableVersion ?? null;

  /**
   * The same analysis the AI screen runs, shown where the rules are.
   *
   * None of it needs a model: the findings come from comparing conditions, and
   * the impact figures from replaying recorded contexts with each rule taken out
   * in turn. Usage findings are skipped for a version that has never been
   * evaluated, which is every draft.
   */
  const [schema, matchRows, historyRows, lastSimulation] = await Promise.all([
    loadContextSchema(store.id),
    prisma.evaluation.findMany({
      where: { storeId: store.id, rulesetVersion: version },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { matchedRules: true },
    }),
    prisma.evaluation.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: IMPACT_LIMIT,
      select: { decisionType: true, context: true },
    }),
    prisma.aiSuggestion.findFirst({
      where: {
        storeId: store.id,
        kind: "version_simulation",
        analysis: { path: ["candidateVersion"], equals: version },
      },
      orderBy: { createdAt: "desc" },
      select: { metrics: true, proposal: true, createdAt: true },
    }),
  ]);

  const rules = toRuleDefs(ruleset.rules);
  const history: HistoricalEvaluation[] = historyRows.map((row) => ({
    decisionType: row.decisionType,
    context: (row.context ?? {}) as Record<string, unknown>,
  }));

  const analysis = analyzeRuleset({
    rules,
    schema,
    evaluations: matchRows.map((row) => ({
      matchedRules: Array.isArray(row.matchedRules)
        ? (row.matchedRules as unknown[]).filter(
            (key): key is string => typeof key === "string",
          )
        : [],
    })),
    history,
  });

  const simulationMetrics =
    lastSimulation?.metrics &&
    typeof lastSimulation.metrics === "object" &&
    "deltas" in lastSimulation.metrics
      ? (lastSimulation.metrics as unknown as SimulationResult)
      : null;
  const simulationNarrative = (() => {
    const proposal = (lastSimulation?.proposal ?? {}) as {
      narrative?: unknown;
    };
    return typeof proposal.narrative === "string" ? proposal.narrative : null;
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Versiunea ${version}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{ruleset.status}</Badge>
            <Link href={`/s/${slug}/rules`}>
              <Button variant="ghost" size="sm">
                ← Reguli
              </Button>
            </Link>
            <Link href={`/s/${slug}/attributes`}>
              <Button variant="outline" size="sm">
                Schema
              </Button>
            </Link>
          </div>
        }
      />

      {!editable && (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--muted)]">
          Această versiune este <strong>{ruleset.status}</strong> și nu poate fi
          modificată.
        </p>
      )}

      <section className="panel flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Analiză și impact</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Calculate de aplicație, fără model: constatările vin din compararea
              condițiilor, iar impactul din reluarea evaluărilor reale cu fiecare
              regulă scoasă pe rând.
            </p>
          </div>
          <SimulateVersionButton
            onSimulate={simulateVersion.bind(null, slug, version)}
            disabled={version === liveVersion || history.length === 0}
            disabledReason={
              version === liveVersion
                ? "Această versiune este cea publicată — este propria referință."
                : "Nu există evaluări înregistrate pentru simulare."
            }
          />
        </div>

        <FindingsList findings={analysis.findings} />

        <ImpactTable
          impacts={analysis.impacts}
          sampleSize={analysis.replaySampleSize}
        />

        {analysis.impacts.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Impactul nu a putut fi măsurat: nu există evaluări salvate pentru
            acest magazin.
          </p>
        )}

        {simulationMetrics && (
          <div className="flex flex-col gap-2">
            <SimulationTable simulation={simulationMetrics} />
            {simulationNarrative && (
              <div className="rounded border border-dashed border-[var(--border)] p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide">
                  Explicație generată de model
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {simulationNarrative}
                </p>
              </div>
            )}
            <p className="text-xs text-[var(--muted)]">
              Simulare din{" "}
              {lastSimulation?.createdAt.toLocaleString("ro-RO") ?? "—"}. Nu
              publică nimic — vezi{" "}
              <Link
                href={`/s/${slug}/rules/ai`}
                className="underline underline-offset-2"
              >
                asistentul AI
              </Link>{" "}
              pentru istoricul complet.
            </p>
          </div>
        )}
      </section>

      <RulesInVersionList
        editable={editable}
        customFields={customFields}
        themeKeys={themeKeys}
        rules={ruleset.rules.map((rule) => ({
          id: rule.id,
          key: rule.key,
          name: rule.name,
          description: rule.description,
          category: rule.category as DecisionType,
          priority: rule.priority,
          enabled: rule.enabled,
          conditions: rule.conditions as Condition,
          actions: rule.actions as Action[],
        }))}
        onSave={saveRuleInDraft.bind(null, slug, version)}
        onDelete={async (ruleKey) => {
          "use server";
          await deleteRuleFromDraft(slug, version, ruleKey);
        }}
      />

      {editable && (
        <section>
          <h2 className="mb-2 text-2xl font-semibold tracking-tight">
            Adaugă regulă
          </h2>
          <RuleEditorPanel
            customFields={customFields}
            themeKeys={themeKeys}
            onSave={saveRuleInDraft.bind(null, slug, version)}
            openLabel="Deschide editorul vizual"
            startOpen={ruleset.rules.length === 0}
          />
        </section>
      )}
    </div>
  );
}
