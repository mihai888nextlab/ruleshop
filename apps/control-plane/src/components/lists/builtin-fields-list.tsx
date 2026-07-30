"use client";

import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { Badge } from "@/components/ui/badge";

export type BuiltinFieldItem = {
  path: string;
  label: string;
  type: string;
  operators: string[];
  availableIn: string[] | null;
};

export function BuiltinFieldsList({ fields }: { fields: BuiltinFieldItem[] }) {
  const types = [...new Set(fields.map((f) => f.type))].sort();

  const list = useListQuery({
    items: fields,
    searchText: (f) =>
      `${f.path} ${f.label} ${f.type} ${f.operators.join(" ")}`,
    filters: [
      {
        key: "type",
        predicate: (f, v) => f.type === v,
      },
    ],
    sorts: {
      label: (a, b) => a.label.localeCompare(b.label),
      type: (a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label),
      path: (a, b) => a.path.localeCompare(b.path),
    },
    defaultSort: "label",
  });

  return (
    <div className="flex flex-col gap-3">
      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Caută câmp…"
        filters={[
          {
            key: "type",
            label: "Tip",
            options: types.map((t) => ({ value: t, label: t })),
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "label", label: "Etichetă" },
          { value: "type", label: "Tip" },
          { value: "path", label: "Path" },
        ]}
        sort={list.sort}
        onSortChange={list.setSort}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
      />

      {list.filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          Niciun rezultat
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.filtered.map((field) => (
            <li key={field.path} className="panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{field.label}</span>
                <Badge tone="muted">{field.type}</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">
                {field.path}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Operatori: {field.operators.join(", ")}
              </p>
              {field.availableIn && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Doar pentru: {field.availableIn.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
