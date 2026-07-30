import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, StatCard } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStoreAnalytics } from "@/lib/analytics";
import { requireStoreRole } from "@/lib/auth";
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
              <Button>Deschide regulile</Button>
            </Link>
            <Link href={`/s/${slug}`}>
              <Button variant="outline">Vezi magazinul</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Produse" value={productCount} />
        <StatCard label="Comenzi (30z)" value={analytics.orderCount} />
        <StatCard label="Venit (30z)" value={formatRon(analytics.revenue)} />
        <StatCard label="Evaluări (30z)" value={analytics.evaluationCount} />
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Analitică · 30 zile
          </h2>
          <Link
            href={`/s/${slug}/admin/analytics`}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Detalii →
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Insight
            label="AOV"
            value={formatRon(analytics.aov)}
          />
          <Insight
            label="Top produs"
            value={topProduct ? topProduct.name : "—"}
            hint={
              topProduct
                ? `${topProduct.quantity} buc · ${formatRon(topProduct.revenue)}`
                : undefined
            }
          />
          <Insight
            label="Canary"
            value={
              analytics.evaluationCount > 0
                ? `${analytics.canaryPercent.toFixed(0)}%`
                : "—"
            }
            hint={
              analytics.evaluationCount > 0
                ? `${analytics.canaryCount} din ${analytics.evaluationCount}`
                : undefined
            }
          />
          <Insight
            label="Regulă top"
            value={topRule ? topRule.key : "—"}
            hint={topRule ? `${topRule.hits} potriviri` : undefined}
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
              Comenzi recente
            </h2>
            <Link
              href={`/s/${slug}/admin/orders`}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Toate →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">Nicio comandă încă.</p>
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
                      {order.items.length} produse
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
              Evaluări recente
            </h2>
            <Link
              href={`/s/${slug}/rules/evaluations`}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Istoric →
            </Link>
          </div>
          {recentEvaluations.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">
              Nicio evaluare încă.
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
                        {ev.isCanary && <Badge tone="warn">canary</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        {matched.length > 0
                          ? matched.slice(0, 3).join(", ")
                          : "fără reguli"}
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
            <h2 className="text-lg font-semibold tracking-tight">Deployment</h2>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">Stable</dt>
                <dd className="font-medium">v{dep?.stableVersion ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">Canary</dt>
                <dd className="font-medium">
                  {dep?.canaryVersion != null
                    ? `v${dep.canaryVersion} · ${dep.canaryPercent}%`
                    : "off"}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-[var(--muted)]">Kill</dt>
                <dd>
                  <Badge tone={killOn ? "danger" : "ok"}>
                    {killOn ? "activ" : "normal"}
                  </Badge>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">Versiuni</dt>
                <dd className="font-medium">{rulesetCount}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/s/${slug}/rules`}>
              <Button size="sm" variant="outline">
                Canary / kill
              </Button>
            </Link>
            <Link href={`/s/${slug}/admin/analytics`}>
              <Button size="sm" variant="ghost">
                Analitică
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
