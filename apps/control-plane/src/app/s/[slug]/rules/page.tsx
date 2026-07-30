import { notFound, redirect } from "next/navigation";
import {
  createDraftRuleset,
  publishRuleset,
  rollbackToVersion,
  setCanaryPercent,
  setKillSwitch,
  setRuleKilled,
  setVersionKilled,
} from "@/app/actions/rules";
import { PageHeader } from "@/components/dashboard/shell";
import { RulesetList } from "@/components/lists/ruleset-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getStoreBySlug,
  parseNumberArray,
  parseStringArray,
} from "@/lib/store";

export default async function RulesHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules`);

  const rulesets = await prisma.ruleset.findMany({
    where: { storeId: store.id },
    orderBy: { version: "desc" },
    include: { _count: { select: { rules: true } } },
  });
  const dep = store.deployment;
  const killCats = (store.killSwitchCategories as Record<string, boolean>) ?? {};
  const killedRuleKeys = parseStringArray(store.killedRuleKeys);
  const killedVersions = parseNumberArray(store.killedVersions);

  const liveRuleset =
    dep?.stableVersion != null
      ? await prisma.ruleset.findUnique({
          where: {
            storeId_version: { storeId: store.id, version: dep.stableVersion },
          },
          include: {
            rules: { orderBy: [{ category: "asc" }, { priority: "desc" }] },
          },
        })
      : null;
  const liveRules = liveRuleset?.rules ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reguli"
        actions={
          <form
            action={async () => {
              "use server";
              const r = await createDraftRuleset(slug, {
                fromVersion: dep?.stableVersion ?? undefined,
              });
              redirect(`/s/${slug}/rules/${r.version}`);
            }}
          >
            <Button type="submit">Draft nou</Button>
          </form>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-xl font-semibold tracking-tight">Canary</h2>
          <form
            className="mt-4 flex gap-2"
            action={async (fd) => {
              "use server";
              await setCanaryPercent(slug, Number(fd.get("percent")));
            }}
          >
            <Input
              name="percent"
              type="number"
              min={0}
              max={100}
              defaultValue={dep?.canaryPercent ?? 0}
            />
            <Button type="submit" variant="outline">
              %
            </Button>
          </form>
        </div>

        <div className="panel p-5">
          <h2 className="text-xl font-semibold tracking-tight">Kill switch</h2>
          <form
            className="mt-4"
            action={async () => {
              "use server";
              await setKillSwitch(slug, {
                killAll: !store.killSwitchEnabled,
              });
            }}
          >
            <Button
              type="submit"
              variant={store.killSwitchEnabled ? "danger" : "outline"}
              size="sm"
            >
              {store.killSwitchEnabled
                ? "Dezactivează kill global"
                : "Activează kill global"}
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                "pricing",
                "shipping",
                "fraud",
                "availability",
                "loyalty",
                "theme",
              ] as const
            ).map((cat) => (
              <form
                key={cat}
                action={async () => {
                  "use server";
                  await setKillSwitch(slug, {
                    categories: { [cat]: !killCats[cat] },
                  });
                }}
              >
                <Button
                  type="submit"
                  size="sm"
                  variant={killCats[cat] ? "danger" : "ghost"}
                >
                  {cat}
                  {killCats[cat] ? " OFF" : ""}
                </Button>
              </form>
            ))}
          </div>
        </div>
      </section>

      {liveRules.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight">
            Reguli active în v{dep?.stableVersion}
          </h2>
          <ul className="flex flex-col gap-2">
            {liveRules.map((rule) => {
              const killed = killedRuleKeys.includes(rule.key);
              return (
                <li
                  key={rule.id}
                  className="panel flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {rule.key}
                      </span>
                      <Badge tone="muted">{rule.category}</Badge>
                      <Badge tone="muted">prio {rule.priority}</Badge>
                      {killed && <Badge tone="warn">oprită</Badge>}
                      {!rule.enabled && (
                        <Badge tone="muted">dezactivată în versiune</Badge>
                      )}
                    </p>
                  </div>
                  <form
                    action={async () => {
                      "use server";
                      await setRuleKilled(slug, rule.key, !killed);
                    }}
                  >
                    <Button
                      type="submit"
                      size="sm"
                      variant={killed ? "danger" : "ghost"}
                    >
                      {killed ? "Reactivează" : "Kill"}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Versiuni</h2>
        <RulesetList
          slug={slug}
          stableVersion={dep?.stableVersion ?? null}
          rulesets={rulesets.map((rs) => ({
            id: rs.id,
            version: rs.version,
            status: rs.status,
            ruleCount: rs._count.rules,
            killed: killedVersions.includes(rs.version),
          }))}
          onPublishStable={async (version) => {
            "use server";
            await publishRuleset(slug, version, "stable");
          }}
          onPublishCanary={async (version) => {
            "use server";
            await publishRuleset(slug, version, "canary", 20);
          }}
          onRollback={async (version) => {
            "use server";
            await rollbackToVersion(slug, version);
          }}
          onToggleKill={async (version, killed) => {
            "use server";
            await setVersionKilled(slug, version, killed);
          }}
        />
      </section>
    </div>
  );
}
