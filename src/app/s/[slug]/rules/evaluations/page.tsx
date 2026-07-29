import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { Badge } from "@/components/ui/badge";

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
      <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
        ← Control plane
      </Link>
      <h1 className="display text-3xl">Istoric evaluări</h1>
      <ul className="flex flex-col gap-2">
        {evaluations.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
          >
            <div className="flex flex-wrap gap-2">
              <Badge>{e.decisionType}</Badge>
              {e.rulesetVersion != null && (
                <Badge tone="muted">v{e.rulesetVersion}</Badge>
              )}
              {e.isCanary && <Badge tone="warn">canary</Badge>}
              <span className="text-[var(--muted)]">
                {e.createdAt.toLocaleString("ro-RO")}
              </span>
            </div>
            <p className="mt-1">
              Reguli:{" "}
              {(e.matchedRules as string[] | null)?.join(", ") || "—"}
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-xs">
              {JSON.stringify(
                { decision: e.decision, explanation: e.explanation },
                null,
                2,
              )}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
