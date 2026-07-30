"use client";

import { useT } from "@/components/i18n-provider";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { RuleEditorPanel } from "@/components/rule-builder/rule-editor-panel";
import { describeCondition } from "@/components/rule-builder/schema-utils";
import { Button } from "@/components/ui/button";
import {
  buildContextSchema,
  type Action,
  type Condition,
  type DecisionType,
  type FieldDef,
} from "@ruleshop/engine";

export type RuleListItem = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: DecisionType;
  priority: number;
  enabled: boolean;
  conditions: Condition;
  actions: Action[];
};

export function RulesInVersionList({
  rules,
  editable,
  customFields,
  themeKeys,
  onSave,
  onDelete,
}: {
  rules: RuleListItem[];
  editable: boolean;
  customFields: FieldDef[];
  themeKeys: string[];
  onSave: (draft: unknown) => Promise<void>;
  onDelete: (ruleKey: string) => Promise<void>;
}) {
  const t = useT();
  const schema = buildContextSchema(customFields);
  const categories = [...new Set(rules.map((r) => r.category))].sort();

  const list = useListQuery({
    items: rules,
    searchText: (r) => `${r.name} ${r.key} ${r.category} ${r.description}`,
    filters: [
      {
        key: "category",
        predicate: (r, v) => r.category === v,
      },
      {
        key: "enabled",
        predicate: (r, v) => (v === "on" ? r.enabled : !r.enabled),
      },
    ],
    sorts: {
      priority: (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      category: (a, b) =>
        a.category.localeCompare(b.category) || b.priority - a.priority,
    },
    defaultSort: "priority",
  });

  return (
    <div className="flex flex-col gap-3">
      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t("rules.searchRule")}
        filters={[
          {
            key: "category",
            label: t("rules.category"),
            options: categories.map((c) => ({
              value: c,
              label: t(`rules.categories.${c}`),
            })),
          },
          {
            key: "enabled",
            label: t("rules.status"),
            options: [
              { value: "on", label: t("rules.ruleActive") },
              { value: "off", label: t("rules.ruleDisabled") },
            ],
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "priority", label: t("rules.sortPriority") },
          { value: "name", label: t("rules.sortName") },
          { value: "category", label: t("rules.category") },
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
          {list.filtered.map((rule) => (
            <li key={rule.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {rule.name}{" "}
                    <span className="text-sm text-[var(--muted)]">
                      ({rule.key})
                    </span>
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {t(`rules.categories.${rule.category}`)} ·{" "}
                    {t("rules.priorityMeta", { priority: rule.priority })} ·{" "}
                    {rule.enabled
                      ? t("rules.activeShort")
                      : t("rules.disabledShort")}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-[var(--muted)]">{t("rules.if")} </span>
                    {describeCondition(rule.conditions, schema)}
                  </p>
                  <p className="text-sm">
                    <span className="text-[var(--muted)]">{t("rules.then")} </span>
                    {rule.actions.map((a) => a.type).join(", ")}
                  </p>
                </div>

                {editable && (
                  <form
                    action={async () => {
                      await onDelete(rule.key);
                    }}
                  >
                    <Button type="submit" variant="danger" size="sm">
                      {t("common.delete")}
                    </Button>
                  </form>
                )}
              </div>

              {editable && (
                <div className="mt-3">
                  <RuleEditorPanel
                    customFields={customFields}
                    themeKeys={themeKeys}
                    initial={{
                      key: rule.key,
                      name: rule.name,
                      description: rule.description,
                      category: rule.category,
                      priority: rule.priority,
                      enabled: rule.enabled,
                      conditions: rule.conditions,
                      actions: rule.actions,
                    }}
                    onSave={onSave}
                    openLabel={t("rules.editVisual")}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
