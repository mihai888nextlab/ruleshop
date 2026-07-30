"use client";

import { useT } from "@/components/i18n-provider";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";

export type AuditListItem = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  email: string | null;
  createdAt: string;
  meta: string | null;
};

export function AuditList({ logs }: { logs: AuditListItem[] }) {
  const t = useT();
  const actions = [...new Set(logs.map((l) => l.action))].sort();

  const list = useListQuery({
    items: logs,
    searchText: (l) =>
      `${l.action} ${l.entity ?? ""} ${l.entityId ?? ""} ${l.email ?? ""} ${l.meta ?? ""}`,
    filters: [
      {
        key: "action",
        predicate: (l, v) => l.action === v,
      },
    ],
    sorts: {
      dateDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
      dateAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
      action: (a, b) => a.action.localeCompare(b.action),
    },
    defaultSort: "dateDesc",
  });

  return (
    <div className="flex flex-col gap-3">
      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t("audit.search")}
        filters={[
          {
            key: "action",
            label: t("audit.action"),
            options: actions.map((a) => ({ value: a, label: a })),
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "dateDesc", label: t("audit.sortDateDesc") },
          { value: "dateAsc", label: t("audit.sortDateAsc") },
          { value: "action", label: t("audit.action") },
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
        <ul className="flex flex-col gap-2">
          {list.filtered.map((l) => (
            <li key={l.id} className="panel px-3 py-2 text-sm">
              <span className="text-[var(--muted)]">
                {new Date(l.createdAt).toLocaleString()}
              </span>{" "}
              · <strong>{l.action}</strong>
              {l.entity && (
                <>
                  {" "}
                  · {l.entity} {l.entityId}
                </>
              )}
              {l.email && (
                <span className="text-[var(--muted)]"> · {l.email}</span>
              )}
              {l.meta && (
                <pre className="mt-1 overflow-x-auto text-xs text-[var(--muted)]">
                  {l.meta}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
