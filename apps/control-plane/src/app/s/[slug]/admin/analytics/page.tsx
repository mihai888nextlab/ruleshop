import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, StatCard } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import {
  getStoreAnalytics,
  parseAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics";
import { requireStoreRole } from "@/lib/auth";
import { getTranslator } from "@/i18n/server";
import { getStoreBySlug } from "@/lib/store";
import { cn, formatRon } from "@/lib/utils";

const RANGE_KEYS: {
  value: AnalyticsRange;
  labelKey: "analytics.days7" | "analytics.days30" | "analytics.allTime";
}[] = [
  { value: "7", labelKey: "analytics.days7" },
  { value: "30", labelKey: "analytics.days30" },
  { value: "all", labelKey: "analytics.allTime" },
];

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeRaw } = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/admin/analytics`);

  const t = await getTranslator();
  const range = parseAnalyticsRange(rangeRaw);
  const data = await getStoreAnalytics(store.id, range);
  const maxDayCount = Math.max(1, ...data.ordersOverTime.map((d) => d.count));
  const maxStatus = Math.max(1, ...data.ordersByStatus.map((s) => s.count));
  const maxType = Math.max(1, ...data.evaluationsByType.map((t) => t.count));
  const maxRule = Math.max(1, ...data.topRules.map((r) => r.hits));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("analytics.title")}
        actions={
          <div className="flex flex-wrap gap-1">
            {RANGE_KEYS.map((r) => (
              <Link
                key={r.value}
                href={`/s/${slug}/admin/analytics?range=${r.value}`}
                className={cn(
                  "squircle rounded-[var(--radius)] border px-2.5 py-1.5 text-xs font-medium",
                  range === r.value
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]",
                )}
              >
                {t(r.labelKey)}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("nav.orders")} value={data.orderCount} />
        <StatCard label={t("analytics.revenue")} value={formatRon(data.revenue)} />
        <StatCard label={t("analytics.aov")} value={formatRon(data.aov)} />
        <StatCard label={t("analytics.evaluations")} value={data.evaluationCount} />
      </div>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("analytics.canaryVsStable")}
        </h2>
        {data.evaluationCount === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            {t("analytics.noEvals")}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="warn">
              {t("analytics.canaryPercent", {
                count: data.canaryCount,
                percent: data.canaryPercent.toFixed(0),
              })}
            </Badge>
            <Badge tone="muted">
              {t("analytics.stableCount", { count: data.stableCount })}
            </Badge>
            <div className="h-2 min-w-[12rem] flex-1 overflow-hidden rounded-[var(--radius)] bg-[var(--surface-2)]">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: `${data.canaryPercent}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("analytics.soldProducts")}
          </h2>
          {data.bestSellers.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {t("analytics.noSales")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {data.bestSellers.map((p, i) => (
                <li
                  key={p.productId}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm"
                >
                  <span>
                    <span className="text-[var(--muted)]">{i + 1}. </span>
                    {p.name}
                  </span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {p.quantity} {t("analytics.units")} · {formatRon(p.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("analytics.ordersByStatus")}
          </h2>
          {data.ordersByStatus.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {t("analytics.noOrders")}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {data.ordersByStatus.map((row) => (
                <li key={row.status} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span>{row.status}</span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {row.count}
                    </span>
                  </div>
                  <BarShare value={row.count} max={maxStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("analytics.ordersOverTime")}
        </h2>
        {data.ordersOverTime.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            {t("analytics.noOrders")}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {data.ordersOverTime.map((row) => (
              <li key={row.day} className="text-sm">
                <div className="mb-1 flex flex-wrap justify-between gap-2">
                  <span className="tabular-nums">{row.day}</span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {row.count} · {formatRon(row.revenue)}
                  </span>
                </div>
                <BarShare value={row.count} max={maxDayCount} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("analytics.evalsByType")}
          </h2>
          {data.evaluationsByType.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {t("analytics.noEvals")}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {data.evaluationsByType.map((row) => (
                <li key={row.type} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span>{row.type}</span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {row.count}
                    </span>
                  </div>
                  <BarShare value={row.count} max={maxType} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("analytics.matchedRules")}
          </h2>
          {data.topRules.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {t("analytics.noRules")}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {data.topRules.map((row) => (
                <li key={row.key} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="font-mono text-xs">{row.key}</span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {row.hits}
                    </span>
                  </div>
                  <BarShare value={row.hits} max={maxRule} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function BarShare({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-[var(--radius)] bg-[var(--surface-2)]">
      <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}
