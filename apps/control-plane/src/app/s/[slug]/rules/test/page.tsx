import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { runDecision } from "@/lib/decide";
import { getStoreBySlug } from "@/lib/store";
import { DecisionPanel } from "@/components/decision-panel";
import { TestHarnessForm } from "@/components/test-harness-form";

export default async function TestHarnessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    type?: string;
    context?: string;
    version?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/test`);

  let result = null as Awaited<ReturnType<typeof runDecision>> | null;
  let parseError = "";
  if (sp.context && sp.type) {
    try {
      const context = JSON.parse(sp.context);
      result = await runDecision({
        storeId: store.id,
        decisionType: sp.type as
          | "pricing"
          | "shipping"
          | "fraud"
          | "availability"
          | "loyalty"
          | "theme",
        context,
        subjectKey: `test:${authz.session.user.id}`,
        persist: true,
        rulesetVersion: sp.version ? Number(sp.version) : undefined,
      });
    } catch (e) {
      parseError = e instanceof Error ? e.message : "Eroare";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display text-3xl">Test harness</h1>
      <p className="text-sm text-[var(--muted)]">
        Evaluează o versiune de reguli pe un context JSON fără a afecta
        storefront-ul (subiect test:).
      </p>
      <TestHarnessForm
        slug={slug}
        defaultType={sp.type ?? "pricing"}
        defaultVersion={sp.version ?? String(store.deployment?.stableVersion ?? "")}
        defaultContext={
          sp.context ??
          JSON.stringify(
            {
              customer: { tier: "vip", isGuest: false },
              product: { category: "outerwear", basePrice: 899, stock: 5 },
              cart: { subtotal: 899, itemCount: 1 },
            },
            null,
            2,
          )
        }
      />
      {parseError && <p className="text-red-700">{parseError}</p>}
      {result && (
        <DecisionPanel
          title="Rezultat test"
          matchedRules={result.matchedRules}
          rulesetVersion={result.rulesetVersion}
          explanation={result.explanation}
          decision={result.decision}
          warnings={result.warnings}
          isCanary={result.isCanary}
          traceId={result.traceId}
        />
      )}
    </div>
  );
}
