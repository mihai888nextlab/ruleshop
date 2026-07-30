"use client";

import Link from "next/link";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { useT } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRon } from "@/lib/utils";

export type OrderListItem = {
  id: string;
  status: string;
  total: number;
  itemCount: number;
  createdAt: string;
};

export function OrderList({
  slug,
  orders,
  updateStatus,
}: {
  slug: string;
  orders: OrderListItem[];
  updateStatus: (
    slug: string,
    orderId: string,
    status: "PENDING" | "PAID" | "SHIPPED" | "CANCELLED" | "BLOCKED",
  ) => Promise<void>;
}) {
  const t = useT();
  const list = useListQuery({
    items: orders,
    searchText: (o) => `${o.id} ${o.status}`,
    filters: [
      {
        key: "status",
        predicate: (o, v) => o.status === v,
      },
    ],
    sorts: {
      dateDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
      dateAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
      totalDesc: (a, b) => b.total - a.total,
      totalAsc: (a, b) => a.total - b.total,
    },
    defaultSort: "dateDesc",
  });

  const statuses = [...new Set(orders.map((o) => o.status))].sort();

  return (
    <div className="flex flex-col gap-3">
      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t("orders.search")}
        filters={[
          {
            key: "status",
            label: t("orders.status"),
            options: statuses.map((s) => ({ value: s, label: s })),
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "dateDesc", label: t("orders.sortDateDesc") },
          { value: "dateAsc", label: t("orders.sortDateAsc") },
          { value: "totalDesc", label: t("orders.sortTotalDesc") },
          { value: "totalAsc", label: t("orders.sortTotalAsc") },
        ]}
        sort={list.sort}
        onSortChange={list.setSort}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
      />

      {list.filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          {t("common.noResults")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.filtered.map((o) => (
            <li key={o.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    href={`/s/${slug}/orders/${o.id}`}
                    className="font-medium hover:underline"
                  >
                    {o.id.slice(0, 10)}…
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {new Date(o.createdAt).toLocaleString("ro-RO")} ·{" "}
                    {formatRon(o.total)} · {o.itemCount}{" "}
                    {t("orders.productsCount")}
                  </p>
                </div>
                <Badge
                  tone={
                    o.status === "BLOCKED"
                      ? "danger"
                      : o.status === "SHIPPED" || o.status === "PAID"
                        ? "ok"
                        : "muted"
                  }
                >
                  {o.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["PAID", "SHIPPED", "CANCELLED"] as const).map((st) => (
                  <form
                    key={st}
                    action={async () => {
                      await updateStatus(slug, o.id, st);
                    }}
                  >
                    <Button type="submit" size="sm" variant="outline">
                      {st}
                    </Button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
