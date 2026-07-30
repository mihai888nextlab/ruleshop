import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { describeCondition } from "@/components/rule-builder/schema-utils";
import { buildContextSchema } from "@ruleshop/engine";
import type { Action, Condition } from "@ruleshop/engine";
import { requireStoreRole } from "@/lib/auth";
import { loadStoreAttributes, toFieldDef } from "@/lib/context-schema";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { themeKeysFor } from "@/lib/theme-service";
import { deleteRuleFromDraft, saveRuleInDraft } from "@/app/actions/rules";
import { RuleEditorPanel } from "@/components/rule-builder/rule-editor-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  // The editor needs this store's vocabulary: built-ins plus its own attributes.
  const defs = await loadStoreAttributes(store.id);
  const customFields = defs.map(toFieldDef);
  const schema = buildContextSchema(customFields);

  // Themes this store defined, so a setTheme action picks from real ones.
  const themeKeys = await themeKeysFor(store.id);

  /**
   * Rules competing for the same decision are grouped so the priority order is
   * visible at a glance — that ordering is what resolves conflicts, and it is
   * hard to reason about from a flat list.
   */
  const byCategory = new Map<string, typeof ruleset.rules>();
  for (const rule of ruleset.rules) {
    const bucket = byCategory.get(rule.category);
    if (bucket) bucket.push(rule);
    else byCategory.set(rule.category, [rule]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
            ← Control plane
          </Link>
          <h1 className="display text-3xl">Versiunea {version}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge>{ruleset.status}</Badge>
            <span className="text-sm text-[var(--muted)]">
              {ruleset.rules.length}{" "}
              {ruleset.rules.length === 1 ? "regulă" : "reguli"}
            </span>
          </div>
        </div>
        <Link href={`/s/${slug}/attributes`}>
          <Button variant="outline" size="sm">
            Schema clientului
          </Button>
        </Link>
      </div>

      {!editable && (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--muted)]">
          Această versiune este <strong>{ruleset.status}</strong> și nu poate fi
          modificată. Creează un draft din control plane pentru a face
          schimbări — versiunile publicate rămân imuabile ca să poată fi
          auditate și restaurate.
        </p>
      )}

      {[...byCategory.entries()].map(([category, rules]) => (
        <section key={category} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {category}{" "}
            <span className="text-sm font-normal text-[var(--muted)]">
              · în ordinea priorității
            </span>
          </h2>

          <ul className="flex flex-col gap-3">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {rule.name}{" "}
                      <span className="text-sm text-[var(--muted)]">
                        ({rule.key})
                      </span>
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      prioritate {rule.priority} ·{" "}
                      {rule.enabled ? "activă" : "dezactivată"}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-[var(--muted)]">dacă </span>
                      {describeCondition(rule.conditions as Condition, schema)}
                    </p>
                    <p className="text-sm">
                      <span className="text-[var(--muted)]">atunci </span>
                      {(rule.actions as Action[])
                        .map((a) => a.type)
                        .join(", ")}
                    </p>
                  </div>

                  {editable && (
                    <form
                      action={async () => {
                        "use server";
                        await deleteRuleFromDraft(slug, version, rule.key);
                      }}
                    >
                      <Button type="submit" variant="danger" size="sm">
                        Șterge
                      </Button>
                    </form>
                  )}
                </div>

                {editable && (
                  <div className="mt-3">
                    <RuleEditorPanel
                      customFields={customFields}
                      themeKeys={themeKeys}
                      initial={{
                        key: rule.key,
                        name: rule.name,
                        description: rule.description,
                        category: rule.category,
                        priority: rule.priority,
                        enabled: rule.enabled,
                        conditions: rule.conditions as Condition,
                        actions: rule.actions as Action[],
                      }}
                      onSave={saveRuleInDraft.bind(null, slug, version)}
                      openLabel="Editează în editorul vizual"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {ruleset.rules.length === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
          Această versiune nu are încă reguli.
        </p>
      )}

      {editable && (
        <section>
          <h2 className="display mb-2 text-2xl">Adaugă regulă</h2>
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
