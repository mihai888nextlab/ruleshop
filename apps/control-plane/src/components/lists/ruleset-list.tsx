"use client";

import Link from "next/link";
import { useT } from "@/components/i18n-provider";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type RulesetListItem = {
  id: string;
  version: number;
  status: string;
  ruleCount: number;
  killed: boolean;
};

export function RulesetList({
  slug,
  rulesets,
  stableVersion,
  onPublishStable,
  onPublishCanary,
  onRollback,
  onToggleKill,
}: {
  slug: string;
  rulesets: RulesetListItem[];
  stableVersion: number | null;
  onPublishStable: (version: number) => Promise<void>;
  onPublishCanary: (version: number) => Promise<void>;
  onRollback: (version: number) => Promise<void>;
  onToggleKill: (version: number, killed: boolean) => Promise<void>;
}) {
  const t = useT();
  const list = useListQuery({
    items: rulesets,
    searchText: (r) => `${r.version} ${r.status}`,
    filters: [
      {
        key: "status",
        predicate: (r, v) => r.status === v,
      },
    ],
    sorts: {
      versionDesc: (a, b) => b.version - a.version,
      versionAsc: (a, b) => a.version - b.version,
      status: (a, b) => a.status.localeCompare(b.status),
    },
    defaultSort: "versionDesc",
  });

  return (
    <div className="flex flex-col gap-3">
      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t("rules.searchVersion")}
        filters={[
          {
            key: "status",
            label: t("rules.status"),
            options: [
              { value: "draft", label: "draft" },
              { value: "published", label: "published" },
              { value: "canary", label: "canary" },
              { value: "archived", label: "archived" },
            ],
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "versionDesc", label: t("rules.sortVersionDesc") },
          { value: "versionAsc", label: t("rules.sortVersionAsc") },
          { value: "status", label: t("rules.status") },
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
          {list.filtered.map((rs) => (
            <li
              key={rs.id}
              className="panel flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <Link
                  href={`/s/${slug}/rules/${rs.version}`}
                  className="text-xl font-semibold tracking-tight hover:underline"
                >
                  {t("rules.versionN", { n: rs.version })}
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
                  <Badge tone="muted">
                    {t("rules.rulesCount", { n: rs.ruleCount })}
                  </Badge>
                  {rs.killed && (
                    <Badge tone="warn">{t("rules.killedBySwitch")}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <form
                  action={async () => {
                    await onToggleKill(rs.version, !rs.killed);
                  }}
                >
                  <Button
                    type="submit"
                    size="sm"
                    variant={rs.killed ? "danger" : "ghost"}
                  >
                    {rs.killed ? t("rules.reactivate") : t("rules.kill")}
                  </Button>
                </form>
                <Link
                  href={`/s/${slug}/rules/diff?a=${rs.version}&b=${stableVersion ?? rs.version}`}
                >
                  <Button variant="ghost" size="sm">
                    {t("nav.diff")}
                  </Button>
                </Link>
                {rs.status === "draft" && (
                  <>
                    <form
                      action={async () => {
                        await onPublishStable(rs.version);
                      }}
                    >
                      <Button type="submit" size="sm">
                        {t("rules.publishStable")}
                      </Button>
                    </form>
                    <form
                      action={async () => {
                        await onPublishCanary(rs.version);
                      }}
                    >
                      <Button type="submit" size="sm" variant="outline">
                        {t("rules.canary20")}
                      </Button>
                    </form>
                  </>
                )}
                {rs.status !== "draft" && stableVersion !== rs.version && (
                  <form
                    action={async () => {
                      await onRollback(rs.version);
                    }}
                  >
                    <Button type="submit" size="sm" variant="secondary">
                      {t("rules.rollbackHere")}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
