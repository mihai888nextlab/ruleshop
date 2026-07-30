"use client";

import { useMemo, useState, useTransition } from "react";
import { OPERATORS_BY_TYPE, customAttributePath } from "@ruleshop/engine";
import type { FieldType } from "@ruleshop/engine";
import { useT } from "@/components/i18n-provider";
import type { TranslateFn } from "@/i18n/dictionary";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AddButton, Modal } from "./ui/modal";

/**
 * Editor for a store's customer attribute definitions.
 *
 * Each row shows the rule path the attribute produces and the operators its type
 * permits, because that is the reason to define one: it is how the field becomes
 * usable in the rule editor.
 */

export interface AttributeRow {
  id: string;
  key: string;
  label: string;
  description: string;
  type: FieldType;
  options: string[];
  required: boolean;
  showOnProfile: boolean;
  archived: boolean;
}

const FIELD_TYPES: FieldType[] = [
  "string",
  "number",
  "boolean",
  "enum",
  "date",
];

function attributeTypes(t: TranslateFn) {
  return FIELD_TYPES.map((value) => ({
    value,
    label: t(`attributes.types.${value}`),
    hint: t(`attributes.typeHints.${value}`),
  }));
}

type Actions = {
  onCreate: (input: unknown) => Promise<{ id: string }>;
  onUpdate: (id: string, input: unknown) => Promise<{ ok: boolean }>;
  onArchive: (id: string, archived: boolean) => Promise<{ ok: boolean }>;
  onDelete: (id: string) => Promise<{ ok: boolean }>;
};

export function AttributeManager({
  attributes,
  actions,
}: {
  attributes: AttributeRow[];
  actions: Actions;
}) {
  const t = useT();
  const types = useMemo(() => attributeTypes(t), [t]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : t("common.operationFailed"),
        );
      }
    });
  }

  const list = useListQuery({
    items: attributes,
    searchText: (a) =>
      `${a.key} ${a.label} ${a.description} ${a.type}`,
    filters: [
      {
        key: "type",
        predicate: (a, v) => a.type === v,
      },
      {
        key: "status",
        predicate: (a, v) => (v === "active" ? !a.archived : a.archived),
      },
    ],
    sorts: {
      label: (a, b) => a.label.localeCompare(b.label),
      key: (a, b) => a.key.localeCompare(b.key),
      type: (a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label),
    },
    defaultSort: "label",
  });

  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
          {t("attributes.defined")}
          <span className="text-sm font-normal tabular-nums text-[var(--muted)]">
            {list.resultCount === list.totalCount
              ? list.totalCount
              : `${list.resultCount} / ${list.totalCount}`}
          </span>
        </h2>

        <DataToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder={t("attributes.search")}
          filters={[
            {
              key: "type",
              label: t("attributes.type"),
              options: types.map((type) => ({
                value: type.value,
                label: type.label,
              })),
            },
            {
              key: "status",
              label: t("attributes.status"),
              options: [
                { value: "active", label: t("attributes.active") },
                { value: "archived", label: t("attributes.archived") },
              ],
            },
          ]}
          filterValues={list.filterValues}
          onFilterChange={list.setFilter}
          sorts={[
            { value: "label", label: t("attributes.sortLabel") },
            { value: "key", label: t("attributes.sortKey") },
            { value: "type", label: t("attributes.type") },
          ]}
          sort={list.sort}
          onSortChange={list.setSort}
          resultCount={list.resultCount}
          totalCount={list.totalCount}
          showCount={false}
          actions={
            <AddButton
              label={t("attributes.add")}
              onClick={() => setCreating(true)}
            />
          }
        />

        {attributes.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
            {t("attributes.empty")}
          </p>
        ) : list.filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            {t("common.noResults")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.filtered.map((attribute) => (
              <AttributeCard
                key={attribute.id}
                attribute={attribute}
                types={types}
                disabled={pending}
                onUpdate={(input) =>
                  run(() => actions.onUpdate(attribute.id, input))
                }
                onArchive={(archived) =>
                  run(() => actions.onArchive(attribute.id, archived))
                }
                onDelete={() => run(() => actions.onDelete(attribute.id))}
              />
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t("attributes.newTitle")}
      >
        <NewAttributeForm
          types={types}
          disabled={pending}
          onSubmit={(input) => {
            run(async () => {
              await actions.onCreate(input);
              setCreating(false);
            });
          }}
        />
      </Modal>
    </div>
  );
}

function slugifyKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([^a-z].*)$/, "a$1")
    .slice(0, 40);
}

function NewAttributeForm({
  types,
  onSubmit,
  disabled,
}: {
  types: ReturnType<typeof attributeTypes>;
  onSubmit: (input: unknown) => void;
  disabled: boolean;
}) {
  const t = useT();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<FieldType>("string");
  const [description, setDescription] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [required, setRequired] = useState(false);

  const keyValid = /^[a-z][a-z0-9_]*$/.test(key);
  const options =
    type === "enum"
      ? optionsText
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
  const canSubmit =
    label.trim().length > 0 &&
    keyValid &&
    (type !== "enum" || options.length > 0);

  function reset() {
    setLabel("");
    setKey("");
    setKeyTouched(false);
    setType("string");
    setDescription("");
    setOptionsText("");
    setShowOnProfile(true);
    setRequired(false);
  }

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || disabled) return;
        onSubmit({
          key,
          label: label.trim(),
          description: description.trim(),
          type,
          options,
          required,
          showOnProfile,
        });
        reset();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("attributes.label")}</span>
        <Input
          value={label}
          onChange={(e) => {
            const next = e.target.value;
            setLabel(next);
            if (!keyTouched) setKey(slugifyKey(next));
          }}
          placeholder="Oraș"
          maxLength={80}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("attributes.key")}</span>
        <Input
          value={key}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(
              e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, "")
                .slice(0, 40),
            );
          }}
          required
          pattern="[a-z][a-z0-9_]*"
          placeholder="oras"
          spellCheck={false}
          className="font-mono"
        />
        {keyValid ? (
          <span className="font-mono text-xs text-[var(--muted)]">
            {customAttributePath(key)}
          </span>
        ) : key.length > 0 ? (
          <span className="text-xs text-[var(--danger)]">
            {t("attributes.keyInvalid")}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("attributes.type")}</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
          className="squircle rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
        >
          {types.map((typeOption) => (
            <option key={typeOption.value} value={typeOption.value}>
              {typeOption.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("attributes.description")}</span>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("common.optional")}
          maxLength={300}
        />
      </label>

      {type === "enum" && (
        <label className="col-span-2 flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("attributes.options")}</span>
          <Input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Cluj, Iași, Timișoara"
            required
          />
        </label>
      )}

      <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showOnProfile}
            onChange={(e) => setShowOnProfile(e.target.checked)}
          />
          {t("attributes.onProfile")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          {t("attributes.required")}
        </label>
      </div>

      <Button
        type="submit"
        disabled={disabled || !canSubmit}
        className="col-span-2 self-start"
      >
        {t("common.add")}
      </Button>
    </form>
  );
}

function AttributeCard({
  attribute,
  types,
  onUpdate,
  onArchive,
  onDelete,
  disabled,
}: {
  attribute: AttributeRow;
  types: ReturnType<typeof attributeTypes>;
  onUpdate: (input: unknown) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const typeLabel =
    types.find((typeOption) => typeOption.value === attribute.type)?.label ??
    attribute.type;

  return (
    <li
      className={
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 " +
        (attribute.archived ? "opacity-60" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{attribute.label}</h3>
            <Badge tone="accent">{typeLabel}</Badge>
            {attribute.required && (
              <Badge tone="warn">{t("attributes.requiredBadge")}</Badge>
            )}
            {!attribute.showOnProfile && (
              <Badge tone="muted">{t("attributes.hiddenBadge")}</Badge>
            )}
            {attribute.archived && (
              <Badge tone="muted">{t("attributes.archivedBadge")}</Badge>
            )}
          </div>

          {attribute.description && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {attribute.description}
            </p>
          )}

          <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">
            {customAttributePath(attribute.key)}
          </p>

          <p className="mt-1 text-xs text-[var(--muted)]">
            {t("attributes.operators")}{" "}
            {OPERATORS_BY_TYPE[attribute.type].join(", ")}
          </p>

          {attribute.type === "enum" && attribute.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {attribute.options.map((option) => (
                <Badge key={option} tone="default">
                  {option}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? t("common.cancel") : t("common.edit")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onArchive(!attribute.archived)}
          >
            {attribute.archived
              ? t("attributes.restore")
              : t("attributes.archive")}
          </Button>
          {confirmingDelete ? (
            <Button
              variant="danger"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              {t("common.confirmDelete")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setConfirmingDelete(true)}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2"
          action={(formData) => {
            const raw = String(formData.get("options") ?? "");
            onUpdate({
              label: String(formData.get("label") ?? ""),
              description: String(formData.get("description") ?? ""),
              required: formData.get("required") === "on",
              showOnProfile: formData.get("showOnProfile") === "on",
              ...(attribute.type === "enum"
                ? {
                    options: raw
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean),
                  }
                : {}),
            });
            setEditing(false);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t("attributes.label")}
            <Input name="label" defaultValue={attribute.label} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("attributes.description")}
            <Input name="description" defaultValue={attribute.description} />
          </label>

          {attribute.type === "enum" && (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {t("attributes.optionsHint")}
              <Input
                name="options"
                defaultValue={attribute.options.join(", ")}
                required
              />
            </label>
          )}

          <div className="flex flex-wrap gap-6 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="showOnProfile"
                defaultChecked={attribute.showOnProfile}
              />
              {t("attributes.visibleOnProfile")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="required"
                defaultChecked={attribute.required}
              />
              {t("attributes.required")}
            </label>
          </div>

          <p className="text-xs text-[var(--muted)] sm:col-span-2">
            {t("attributes.immutableNote")}
          </p>

          <Button type="submit" size="sm" disabled={disabled} className="self-start">
            {t("common.save")}
          </Button>
        </form>
      )}
    </li>
  );
}
