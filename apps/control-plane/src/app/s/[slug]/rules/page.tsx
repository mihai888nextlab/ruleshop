import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/shell";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getStoreBySlug,
  parseNumberArray,
  parseStringArray,
} from "@/lib/store";
import {
  createDraftRuleset,
  publishRuleset,
  rollbackToVersion,
  setCanaryPercent,
  setKillSwitch,
  setRuleKilled,
  setVersionKilled,
} from "@/app/actions/rules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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

  // The rules an individual kill switch can act on are the ones currently being
  // served, which is the stable version.
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
        eyebrow="Lifecycle"
        title="Reguli"
        description={`Stable v${dep?.stableVersion ?? "—"} · Canary ${
          dep?.canaryVersion != null
            ? `v${dep.canaryVersion} (${dep.canaryPercent}%)`
            : "off"
        }`}
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
          <h2 className="display text-xl">Canary</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Direcționează un procent din trafic către o versiune experimentală.
          </p>
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
              Setează %
            </Button>
          </form>
        </div>

        <div className="panel p-5">
          <h2 className="display text-xl">Kill switch</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Oprește imediat categoriile de reguli fără un rollback complet.
          </p>
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
          <h2 className="eyebrow mb-3">
            Reguli active în v{dep?.stableVersion} — kill individual
          </h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Scoate din funcțiune o singură regulă, imediat și fără a modifica
            versiunea publicată. Restul regulilor continuă să se aplice, iar
            urma evaluării va arăta că regula a fost oprită.
          </p>
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
        <h2 className="eyebrow mb-3">Versiuni</h2>
        <ul className="flex flex-col gap-3">
          {rulesets.map((rs) => (
            <li key={rs.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link
                  href={`/s/${slug}/rules/${rs.version}`}
                  className="display text-xl hover:underline"
                >
                  Versiunea {rs.version}
                </Link>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge
                    tone={
                      rs.status === "published"
                        ? "ok"
                        : rs.status === "canary"
                          ? "warn"
                          : "muted"
                    }
                  >
                    {rs.status}
                  </Badge>
                  <Badge tone="muted">{rs._count.rules} reguli</Badge>
                  {killedVersions.includes(rs.version) && (
                    <Badge tone="warn">oprită prin kill switch</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Killing a version refuses it at resolution time, without
                    editing it — published versions stay immutable so they remain
                    auditable and restorable. */}
                <form
                  action={async () => {
                    "use server";
                    await setVersionKilled(
                      slug,
                      rs.version,
                      !killedVersions.includes(rs.version),
                    );
                  }}
                >
                  <Button
                    type="submit"
                    size="sm"
                    variant={
                      killedVersions.includes(rs.version) ? "danger" : "ghost"
                    }
                    title={
                      killedVersions.includes(rs.version)
                        ? "Reia servirea acestei versiuni"
                        : "Oprește imediat servirea acestei versiuni"
                    }
                  >
                    {killedVersions.includes(rs.version) ? "Reactivează" : "Kill"}
                  </Button>
                </form>
                <Link
                  href={`/s/${slug}/rules/diff?a=${rs.version}&b=${dep?.stableVersion ?? rs.version}`}
                >
                  <Button variant="ghost" size="sm">
                    Diff
                  </Button>
                </Link>
                {rs.status === "draft" && (
                  <>
                    <form
                      action={async () => {
                        "use server";
                        await publishRuleset(slug, rs.version, "stable");
                      }}
                    >
                      <Button type="submit" size="sm">
                        Publică stable
                      </Button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await publishRuleset(slug, rs.version, "canary", 20);
                      }}
                    >
                      <Button type="submit" size="sm" variant="outline">
                        Canary 20%
                      </Button>
                    </form>
                  </>
                )}
                {rs.status !== "draft" && dep?.stableVersion !== rs.version && (
                  <form
                    action={async () => {
                      "use server";
                      await rollbackToVersion(slug, rs.version);
                    }}
                  >
                    <Button type="submit" size="sm" variant="secondary">
                      Rollback aici
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
