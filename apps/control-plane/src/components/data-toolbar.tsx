"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";

export type ListFilter = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

export type ListSort = {
  value: string;
  label: string;
};

export function DataToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  filterValues,
  onFilterChange,
  sorts = [],
  sort,
  onSortChange,
  resultCount,
  totalCount,
  showCount = true,
  actions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ListFilter[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  sorts?: ListSort[];
  sort?: string;
  onSortChange?: (value: string) => void;
  resultCount: number;
  totalCount: number;
  showCount?: boolean;
  actions?: ReactNode;
}) {
  const t = useT();
  const placeholder = searchPlaceholder ?? t("common.searchPlaceholder");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className="sm:max-w-xs"
        aria-label={t("common.search")}
      />
      {filters.map((filter) => (
        <select
          key={filter.key}
          value={filterValues?.[filter.key] ?? ""}
          onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
          aria-label={filter.label}
          className="squircle rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          <option value="">
            {t("common.filterAll", { filter: filter.label })}
          </option>
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
      {sorts.length > 0 && (
        <select
          value={sort ?? sorts[0]?.value}
          onChange={(e) => onSortChange?.(e.target.value)}
          aria-label={t("common.sort")}
          className="squircle rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          {sorts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {showCount && (
        <p className="text-xs text-[var(--muted)] sm:ml-auto">
          {resultCount === totalCount
            ? `${totalCount}`
            : `${resultCount} / ${totalCount}`}
        </p>
      )}
      {actions && (
        <div className={showCount ? "" : "sm:ml-auto"}>{actions}</div>
      )}
    </div>
  );
}

export function useListQuery<T>({
  items,
  searchText,
  matchesSearch,
  filters,
  sorts,
  defaultSort,
}: {
  items: T[];
  searchText: (item: T) => string;
  matchesSearch?: (item: T, query: string) => boolean;
  filters?: {
    key: string;
    predicate: (item: T, value: string) => boolean;
  }[];
  sorts: Record<string, (a: T, b: T) => number>;
  defaultSort: string;
}) {
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(defaultSort);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = items;

    if (q) {
      rows = rows.filter((item) =>
        matchesSearch
          ? matchesSearch(item, q)
          : searchText(item).toLowerCase().includes(q),
      );
    }

    for (const filter of filters ?? []) {
      const value = filterValues[filter.key];
      if (value) rows = rows.filter((item) => filter.predicate(item, value));
    }

    const compare = sorts[sort] ?? sorts[defaultSort];
    if (compare) rows = [...rows].sort(compare);
    return rows;
  }, [
    items,
    search,
    filterValues,
    sort,
    searchText,
    matchesSearch,
    filters,
    sorts,
    defaultSort,
  ]);

  function setFilter(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  return {
    search,
    setSearch,
    filterValues,
    setFilter,
    sort,
    setSort,
    filtered,
    totalCount: items.length,
    resultCount: filtered.length,
  };
}
