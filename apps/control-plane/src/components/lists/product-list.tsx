"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { DataToolbar, useListQuery } from "@/components/data-toolbar";
import { ProductAdminForm } from "@/components/product-admin-form";
import { Badge } from "@/components/ui/badge";
import { AddButton, Modal } from "@/components/ui/modal";
import { formatRon } from "@/lib/utils";

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  basePrice: number;
  stock: number;
  active: boolean;
  imageUrl: string | null;
};

export function ProductList({
  slug,
  products,
  upsertProduct,
}: {
  slug: string;
  products: ProductListItem[];
  upsertProduct: (slug: string, formData: FormData) => Promise<void>;
}) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const categories = [...new Set(products.map((p) => p.category))].sort();

  const list = useListQuery({
    items: products,
    searchText: (p) => `${p.name} ${p.slug} ${p.category} ${p.description}`,
    filters: [
      {
        key: "active",
        predicate: (p, v) => (v === "active" ? p.active : !p.active),
      },
      {
        key: "category",
        predicate: (p, v) => p.category === v,
      },
    ],
    sorts: {
      name: (a, b) => a.name.localeCompare(b.name),
      priceAsc: (a, b) => a.basePrice - b.basePrice,
      priceDesc: (a, b) => b.basePrice - a.basePrice,
      stock: (a, b) => b.stock - a.stock,
    },
    defaultSort: "name",
  });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
        {t("products.catalog")}
        <span className="text-sm font-normal tabular-nums text-[var(--muted)]">
          {list.resultCount === list.totalCount
            ? list.totalCount
            : `${list.resultCount} / ${list.totalCount}`}
        </span>
      </h2>

      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t("products.search")}
        filters={[
          {
            key: "active",
            label: t("products.status"),
            options: [
              { value: "active", label: t("common.active") },
              { value: "inactive", label: t("common.inactive") },
            ],
          },
          {
            key: "category",
            label: t("products.category"),
            options: categories.map((c) => ({ value: c, label: c })),
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "name", label: t("products.sortName") },
          { value: "priceAsc", label: t("products.sortPriceAsc") },
          { value: "priceDesc", label: t("products.sortPriceDesc") },
          { value: "stock", label: t("products.sortStock") },
        ]}
        sort={list.sort}
        onSortChange={list.setSort}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
        showCount={false}
        actions={
          <AddButton label={t("products.add")} onClick={() => setCreating(true)} />
        }
      />

      {list.filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          {products.length === 0 ? t("products.empty") : t("common.noResults")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.filtered.map((p) => (
            <li
              key={p.id}
              className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start"
            >
              <div className="flex gap-3">
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-[var(--radius)] border border-[var(--border)] object-cover"
                  />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    {!p.active && (
                      <Badge tone="danger">{t("products.inactiveBadge")}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    /{p.slug} · {p.category} · {t("products.stock")} {p.stock}{" "}
                    · {formatRon(p.basePrice)}
                  </p>
                </div>
              </div>
              <ProductAdminForm
                slug={slug}
                upsertProduct={upsertProduct}
                initial={{
                  id: p.id,
                  name: p.name,
                  productSlug: p.slug,
                  description: p.description,
                  category: p.category,
                  basePrice: p.basePrice,
                  stock: p.stock,
                  active: p.active,
                  imageUrl: p.imageUrl,
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t("products.newTitle")}
      >
        <ProductAdminForm
          slug={slug}
          upsertProduct={upsertProduct}
          embedded
          onSuccess={() => setCreating(false)}
        />
      </Modal>
    </div>
  );
}
