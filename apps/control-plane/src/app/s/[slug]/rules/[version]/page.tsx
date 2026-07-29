import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import {
  deleteRuleFromDraft,
  saveRuleInDraft,
} from "@/app/actions/rules";
import { RuleEditorForm } from "@/components/rule-editor-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function RulesetDetailPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version: versionStr } = await params;
  const version = Number(versionStr);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
            ← Control plane
          </Link>
          <h1 className="display text-3xl">Versiunea {version}</h1>
          <Badge>{ruleset.status}</Badge>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {ruleset.rules.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {r.name}{" "}
                  <span className="text-sm text-[var(--muted)]">({r.key})</span>
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {r.category} · prio {r.priority} ·{" "}
                  {r.enabled ? "activă" : "dezactivată"}
                </p>
              </div>
              {editable && (
                <form
                  action={async () => {
                    "use server";
                    await deleteRuleFromDraft(slug, version, r.key);
                  }}
                >
                  <Button type="submit" variant="danger" size="sm">
                    Șterge
                  </Button>
                </form>
              )}
            </div>
            <pre className="overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-xs">
              {JSON.stringify(
                { conditions: r.conditions, actions: r.actions },
                null,
                2,
              )}
            </pre>
            {editable && (
              <div className="mt-3">
                <RuleEditorForm
                  initial={{
                    key: r.key,
                    name: r.name,
                    description: r.description,
                    category: r.category,
                    priority: r.priority,
                    enabled: r.enabled,
                    conditions: r.conditions,
                    actions: r.actions,
                  }}
                  onSave={async (rule) => {
                    "use server";
                    await saveRuleInDraft(slug, version, rule);
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <div>
          <h2 className="mb-2 display text-2xl">Adaugă regulă</h2>
          <RuleEditorForm
            onSave={async (rule) => {
              "use server";
              await saveRuleInDraft(slug, version, rule);
            }}
          />
        </div>
      )}
    </div>
  );
}
