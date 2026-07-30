import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, StatCard } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStoreAnalytics } from "@/lib/analytics";
import { requireStoreRole } from "@/lib/auth";
import { getTranslator } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";

export default async function StoreAdminOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/admin`);

  const t = await getTranslator();

  const [
    productCount,
    rulesetCount,
    analytics,
    recentOrders,
    recentEvaluations,
  ] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.ruleset.count({ where: { storeId: store.id } }),
    getStoreAnalytics(store.id, "30"),
    prisma.order.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: true },
    }),
    prisma.evaluation.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        decisionType: true,
        rulesetVersion: true,
        isCanary: true,
        matchedRules: true,
        createdAt: true,
      },
    }),
  ]);

  const dep = store.deployment;
  const killOn = store.killSwitchEnabled;
  const topProduct = analytics.bestSellers[0];
  const topRule = analytics.topRules[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={store.name}
        actions={
          <>
            <Link href={`/s/${slug}/rules`}>
              <Button>{t("analytics.openRules")}</Button>
            </Link>
            <Link href={`/s/${slug}`}>
              <Button variant="outline">{t("analytics.viewStore")}</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("analytics.products")} value={productCount} />
        <StatCard label={t("analytics.orders30")} value={analytics.orderCount} />
        <StatCard
          label={t("analytics.revenue30")}
          value={formatRon(analytics.revenue)}
        />
        <StatCard
          label={t("analytics.evals30")}
          value={analytics.evaluationCount}
        />
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("analytics.analytics30")}
          </h2>
          <Link
            href={`/s/${slug}/admin/analytics`}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            {t("analytics.details")}
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Insight
            label={t("analytics.aov")}
            value={formatRon(analytics.aov)}
          />
          <Insight
            label={t("analytics.topProduct")}
            value={topProduct ? topProduct.name : "—"}
            hint={
              topProduct
                ? `${topProduct.quantity} ${t("analytics.units")} · ${formatRon(topProduct.revenue)}`
                : undefined
            }
          />
          <Insight
            label={t("analytics.canary")}
            value={
              analytics.evaluationCount > 0
                ? `${analytics.canaryPercent.toFixed(0)}%`
                : "—"
            }
            hint={
              analytics.evaluationCount > 0
                ? t("analytics.canaryOfTotal", {
                    canary: analytics.canaryCount,
                    total: analytics.evaluationCount,
                  })
                : undefined
            }
          />
          <Insight
            label={t("analytics.topRule")}
            value={topRule ? topRule.key : "—"}
            hint={
              topRule
                ? `${topRule.hits} ${t("analytics.matches")}`
                : undefined
            }
            mono
          />
        </div>

        {analytics.ordersByStatus.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            {analytics.ordersByStatus.map((row) => (
              <Badge key={row.status} tone="muted">
                {row.status} {row.count}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("analytics.recentOrders")}
            </h2>
            <Link
              href={`/s/${slug}/admin/orders`}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {t("analytics.allArrow")}
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">
              {t("orders.empty")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <Link
                      href={`/s/${slug}/orders/${order.id}`}
                      className="font-medium hover:underline"
                    >
                      {order.id.slice(0, 10)}…
                    </Link>
                    <p className="text-xs text-[var(--muted)]">
                      {order.createdAt.toLocaleString("ro-RO")} ·{" "}
                      {order.items.length} {t("orders.productsCount")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">
                      {formatRon(Number(order.total.toString()))}
                    </span>
                    <Badge
                      tone={
                        order.status === "BLOCKED"
                          ? "danger"
                          : order.status === "SHIPPED" || order.status === "PAID"
                            ? "ok"
                            : "muted"
                      }
                    >
                      {order.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("analytics.recentEvals")}
            </h2>
            <Link
              href={`/s/${slug}/rules/evaluations`}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {t("analytics.historyArrow")}
            </Link>
          </div>
          {recentEvaluations.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">
              {t("analytics.noEvalsYet")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {recentEvaluations.map((ev) => {
                const matched = Array.isArray(ev.matchedRules)
                  ? (ev.matchedRules as unknown[]).filter(
                      (v): v is string => typeof v === "string",
                    )
                  : [];
                return (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge>{ev.decisionType}</Badge>
                        {ev.rulesetVersion != null && (
                          <Badge tone="muted">v{ev.rulesetVersion}</Badge>
                        )}
                        {ev.isCanary && (
                          <Badge tone="warn">{t("analytics.canary")}</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        {matched.length > 0
                          ? matched.slice(0, 3).join(", ")
                          : t("analytics.noRulesMatched")}
                        {matched.length > 3 ? "…" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {ev.createdAt.toLocaleString("ro-RO")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("analytics.deployment")}
            </h2>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">{t("analytics.stable")}</dt>
                <dd className="font-medium">v{dep?.stableVersion ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">{t("analytics.canary")}</dt>
                <dd className="font-medium">
                  {dep?.canaryVersion != null
                    ? `v${dep.canaryVersion} · ${dep.canaryPercent}%`
                    : "off"}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-[var(--muted)]">{t("analytics.kill")}</dt>
                <dd>
                  <Badge tone={killOn ? "danger" : "ok"}>
                    {killOn ? t("analytics.killActive") : t("analytics.killNormal")}
                  </Badge>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">{t("analytics.versions")}</dt>
                <dd className="font-medium">{rulesetCount}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/s/${slug}/rules`}>
              <Button size="sm" variant="outline">
                {t("analytics.canaryKill")}
              </Button>
            </Link>
            <Link href={`/s/${slug}/admin/analytics`}>
              <Button size="sm" variant="ghost">
                {t("analytics.title")}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Insight({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={
          "mt-1 truncate text-sm font-semibold tracking-tight " +
          (mono ? "font-mono text-xs" : "")
        }
        title={value}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{hint}</p>
      )}
    </div>
  );
}
