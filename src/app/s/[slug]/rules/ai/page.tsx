import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  analyzeRulesWithAi,
  proposeRuleWithAi,
  reviewSuggestion,
  simulateSuggestion,
} from "@/app/actions/ai";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AiProposeForm } from "@/components/ai-propose-form";

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

  const suggestions = await prisma.aiSuggestion.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
          ← Control plane
        </Link>
        <h1 className="display text-3xl">Asistent AI (Kimi)</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Sugestiile sunt validate de aplicație. Publicarea necesită aprobare
          umană explicită — AI-ul creează doar draft-uri, niciodată versiuni
          live.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <form
          action={async () => {
            "use server";
            await analyzeRulesWithAi(slug);
          }}
        >
          <Button type="submit">Analizează regulile curente</Button>
        </form>
      </div>

      <AiProposeForm
        onPropose={async (prompt, category) => {
          "use server";
          await proposeRuleWithAi(slug, prompt, category || undefined);
        }}
      />

      <ul className="flex flex-col gap-4">
        {suggestions.map((s) => {
          const proposal = s.proposal as Record<string, unknown>;
          return (
            <li
              key={s.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge>{s.kind}</Badge>
                <Badge
                  tone={
                    s.status === "approved"
                      ? "ok"
                      : s.status === "rejected"
                        ? "warn"
                        : "accent"
                  }
                >
                  {s.status}
                </Badge>
                {s.confidence != null && (
                  <Badge tone="muted">
                    încredere {(s.confidence * 100).toFixed(0)}%
                  </Badge>
                )}
                <span className="text-xs text-[var(--muted)]">
                  {s.createdAt.toLocaleString("ro-RO")}
                </span>
              </div>
              {s.prompt && (
                <p className="mb-2 text-sm">
                  <strong>Prompt:</strong> {s.prompt}
                </p>
              )}
              <pre className="max-h-64 overflow-auto rounded bg-[var(--surface-2)] p-2 text-xs">
                {JSON.stringify({ proposal, metrics: s.metrics }, null, 2)}
              </pre>
              {s.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form
                    action={async () => {
                      "use server";
                      await simulateSuggestion(slug, s.id);
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      Simulează pe istoric
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await reviewSuggestion(slug, s.id, "approved");
                    }}
                  >
                    <Button type="submit" size="sm">
                      Aprobă → draft
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await reviewSuggestion(slug, s.id, "rejected");
                    }}
                  >
                    <Button type="submit" variant="danger" size="sm">
                      Respinge
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
