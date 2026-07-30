import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/shell";
import { EvaluationList } from "@/components/lists/evaluation-list";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/evaluations`);

  const evaluations = await prisma.evaluation.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Istoric evaluări" />
      <EvaluationList
        slug={slug}
        evaluations={evaluations.map((e) => ({
          id: e.id,
          decisionType: e.decisionType,
          rulesetVersion: e.rulesetVersion,
          isCanary: e.isCanary,
          matchedRules: asStringArray(e.matchedRules),
          createdAt: e.createdAt.toISOString(),
          subjectKey: e.subjectKey,
          decision: asRecord(e.decision),
          explanation: asExplanation(e.explanation),
          warnings: asStringArray(e.warnings),
        }))}
      />
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function asExplanation(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const row = step as Record<string, unknown>;
    if (typeof row.ruleKey !== "string") return [];
    return [
      {
        ruleKey: row.ruleKey,
        ruleName: typeof row.ruleName === "string" ? row.ruleName : undefined,
        matched: Boolean(row.matched),
        reason: typeof row.reason === "string" ? row.reason : "",
        appliedActions: Array.isArray(row.appliedActions)
          ? row.appliedActions
          : undefined,
      },
    ];
  });
}
