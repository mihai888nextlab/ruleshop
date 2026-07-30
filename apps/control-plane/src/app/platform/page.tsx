import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateStoreForm } from "@/components/create-store-form";
import { PageHeader, StatCard } from "@/components/dashboard/shell";
import { PlatformDashboard } from "@/components/dashboard/wrappers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTranslator } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PlatformPage() {
  const t = await getTranslator();
  const session = await auth();
  if (!session?.user || session.user.platformRole !== "PLATFORM_ADMIN") {
    redirect("/login?next=/platform");
  }

  const stores = await prisma.store.findMany({
    include: {
      _count: {
        select: {
          products: true,
          orders: true,
          rulesets: true,
          evaluations: true,
        },
      },
      deployment: true,
    },
    orderBy: { name: "asc" },
  });

  const totals = stores.reduce(
    (acc, s) => {
      acc.products += s._count.products;
      acc.orders += s._count.orders;
      acc.rulesets += s._count.rulesets;
      acc.evaluations += s._count.evaluations;
      return acc;
    },
    { products: 0, orders: 0, rulesets: 0, evaluations: 0 },
  );

  return (
    <PlatformDashboard>
      <PageHeader title={t("platform.title")} />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("platform.stores")} value={stores.length} />
        <StatCard label={t("platform.products")} value={totals.products} />
        <StatCard label={t("platform.orders")} value={totals.orders} />
        <StatCard label={t("platform.evaluations")} value={totals.evaluations} />
      </div>

      <div className="mb-8">
        <CreateStoreForm />
      </div>

      <ul className="grid gap-4 lg:grid-cols-2">
        {stores.map((s) => (
          <li key={s.id} className="panel flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {s.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">/{s.slug}</p>
              </div>
              <Badge tone="ok">
                {t("platform.stableBadge", {
                  version: s.deployment?.stableVersion ?? "—",
                })}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="muted">
                {s._count.products} {t("platform.productsCount")}
              </Badge>
              <Badge tone="muted">
                {s._count.orders} {t("platform.ordersCount")}
              </Badge>
              <Badge tone="muted">
                {s._count.rulesets} {t("platform.versionsCount")}
              </Badge>
              <Badge tone="muted">
                {s._count.evaluations} {t("platform.evaluationsCount")}
              </Badge>
              {s.deployment?.canaryVersion != null && (
                <Badge tone="warn">
                  {t("platform.canaryBadge", {
                    version: s.deployment.canaryVersion,
                    percent: s.deployment.canaryPercent,
                  })}
                </Badge>
              )}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Link href={`/s/${s.slug}/admin`}>
                <Button size="sm">{t("common.dashboard")}</Button>
              </Link>
              <Link href={`/s/${s.slug}/admin/connection`}>
                <Button size="sm" variant="outline">
                  {t("nav.connection")}
                </Button>
              </Link>
              <Link href={`/s/${s.slug}/rules`}>
                <Button size="sm" variant="outline">
                  {t("nav.rules")}
                </Button>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </PlatformDashboard>
  );
}
