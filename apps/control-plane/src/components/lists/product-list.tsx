"use client";

import { useState } from "react";
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
        Catalog
        <span className="text-sm font-normal tabular-nums text-[var(--muted)]">
          {list.resultCount === list.totalCount
            ? list.totalCount
            : `${list.resultCount} / ${list.totalCount}`}
        </span>
      </h2>

      <DataToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Caută produs…"
        filters={[
          {
            key: "active",
            label: "Stare",
            options: [
              { value: "active", label: "Activ" },
              { value: "inactive", label: "Inactiv" },
            ],
          },
          {
            key: "category",
            label: "Categorie",
            options: categories.map((c) => ({ value: c, label: c })),
          },
        ]}
        filterValues={list.filterValues}
        onFilterChange={list.setFilter}
        sorts={[
          { value: "name", label: "Nume" },
          { value: "priceAsc", label: "Preț ↑" },
          { value: "priceDesc", label: "Preț ↓" },
          { value: "stock", label: "Stoc" },
        ]}
        sort={list.sort}
        onSortChange={list.setSort}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
        showCount={false}
        actions={
          <AddButton label="Adaugă produs" onClick={() => setCreating(true)} />
        }
      />

      {list.filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          {products.length === 0 ? "Niciun produs încă." : "Niciun rezultat"}
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
                    {!p.active && <Badge tone="danger">inactiv</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    /{p.slug} · {p.category} · stoc {p.stock} ·{" "}
                    {formatRon(p.basePrice)}
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
        title="Produs nou"
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
