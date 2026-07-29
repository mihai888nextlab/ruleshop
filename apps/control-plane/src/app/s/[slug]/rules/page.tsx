import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import {
  createDraftRuleset,
  publishRuleset,
  rollbackToVersion,
  setCanaryPercent,
  setKillSwitch,
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl">Control plane — reguli</h1>
          <p className="text-sm text-[var(--muted)]">
            Stable: v{dep?.stableVersion ?? "—"} · Canary:{" "}
            {dep?.canaryVersion != null
              ? `v${dep.canaryVersion} (${dep.canaryPercent}%)`
              : "off"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/s/${slug}/attributes`}>
            <Button variant="outline">Schema clientului</Button>
          </Link>
          <Link href={`/s/${slug}/rules/test`}>
            <Button variant="outline">Test harness</Button>
          </Link>
          <Link href={`/s/${slug}/rules/evaluations`}>
            <Button variant="outline">Evaluări</Button>
          </Link>
          <Link href={`/s/${slug}/rules/audit`}>
            <Button variant="outline">Audit</Button>
          </Link>
          <Link href={`/s/${slug}/rules/ai`}>
            <Button variant="secondary">AI</Button>
          </Link>
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
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-medium">Canary</h2>
          <form
            className="flex gap-2"
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
        <div>
          <h2 className="mb-2 font-medium">Kill switch</h2>
          <form
            className="mb-2"
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
          <div className="flex flex-wrap gap-2">
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

      <ul className="flex flex-col gap-3">
        {rulesets.map((rs) => (
          <li
            key={rs.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div>
              <Link
                href={`/s/${slug}/rules/${rs.version}`}
                className="display text-xl hover:underline"
              >
                Versiunea {rs.version}
              </Link>
              <div className="mt-1 flex flex-wrap gap-2">
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
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/s/${slug}/rules/diff?a=${rs.version}&b=${dep?.stableVersion ?? rs.version}`}>
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
    </div>
  );
}
