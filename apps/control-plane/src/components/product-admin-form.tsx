"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type ProductData = {
  id?: string;
  name: string;
  productSlug: string;
  description: string;
  category: string;
  basePrice: number;
  stock: number;
  active: boolean;
};

export function ProductAdminForm({
  slug,
  upsertProduct,
  initial,
}: {
  slug: string;
  upsertProduct: (slug: string, data: ProductData) => Promise<void>;
  initial?: ProductData;
}) {
  const [open, setOpen] = useState(!initial);
  const [error, setError] = useState("");

  if (!open && initial) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Editează
      </Button>
    );
  }

  return (
    <form
      className="grid gap-2 rounded-lg border border-dashed border-[var(--border)] p-3 sm:grid-cols-2"
      action={async (fd) => {
        setError("");
        try {
          await upsertProduct(slug, {
            id: initial?.id,
            name: String(fd.get("name")),
            productSlug: String(fd.get("productSlug")),
            description: String(fd.get("description")),
            category: String(fd.get("category")),
            basePrice: Number(fd.get("basePrice")),
            stock: Number(fd.get("stock")),
            active: fd.get("active") === "on",
          });
          if (initial) setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Eroare");
        }
      }}
    >
      <Input name="name" placeholder="Nume" defaultValue={initial?.name} required />
      <Input
        name="productSlug"
        placeholder="slug"
        defaultValue={initial?.productSlug}
        required
      />
      <Input
        name="category"
        placeholder="categorie"
        defaultValue={initial?.category ?? "general"}
        required
      />
      <Input
        name="basePrice"
        type="number"
        step="0.01"
        placeholder="preț bază"
        defaultValue={initial?.basePrice ?? 100}
        required
      />
      <Input
        name="stock"
        type="number"
        placeholder="stoc"
        defaultValue={initial?.stock ?? 10}
        required
      />
      <Input
        name="description"
        placeholder="descriere"
        defaultValue={initial?.description}
      />
      <label className="flex items-center gap-2 text-sm">
        <input name="active" type="checkbox" defaultChecked={initial?.active ?? true} />
        Activ
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {initial ? "Salvează" : "Adaugă produs"}
        </Button>
        {initial && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Anulează
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
    </form>
  );
}
