"use client";

import { useRouter } from "next/navigation";
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
  imageUrl?: string | null;
};

function slugifyProduct(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function ProductAdminForm({
  slug,
  upsertProduct,
  initial,
  embedded,
  onSuccess,
}: {
  slug: string;
  upsertProduct: (slug: string, formData: FormData) => Promise<void>;
  initial?: ProductData;
  /** Modal / plain form — no panel chrome, single column. */
  embedded?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const [open, setOpen] = useState(!initial);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [name, setName] = useState(initial?.name ?? "");
  const [productSlug, setProductSlug] = useState(initial?.productSlug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [category, setCategory] = useState(initial?.category ?? "");
  const [basePrice, setBasePrice] = useState(
    initial?.basePrice != null ? String(initial.basePrice) : "",
  );
  const [stock, setStock] = useState(
    initial?.stock != null ? String(initial.stock) : "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [active, setActive] = useState(initial?.active ?? true);

  if (!open && initial) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Editează
      </Button>
    );
  }

  function resetCreate() {
    setName("");
    setProductSlug("");
    setSlugTouched(false);
    setCategory("");
    setBasePrice("");
    setStock("");
    setDescription("");
    setActive(true);
    setPreview(null);
  }

  return (
    <form
      className={
        embedded
          ? "flex flex-col gap-4"
          : isEdit
            ? "mt-3 flex flex-col gap-4 border-t border-[var(--border)] pt-4"
            : "panel flex flex-col gap-4 p-5"
      }
      action={async (fd) => {
        setError("");
        setPending(true);
        try {
          if (initial?.id) fd.set("id", initial.id);
          fd.set("name", name.trim());
          fd.set("productSlug", productSlug.trim());
          fd.set("category", category.trim() || "general");
          fd.set("basePrice", basePrice);
          fd.set("stock", stock);
          fd.set("description", description.trim());
          if (active) fd.set("active", "on");
          await upsertProduct(slug, fd);
          setPreview(null);
          router.refresh();
          if (initial) setOpen(false);
          else resetCreate();
          onSuccess?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Eroare");
        } finally {
          setPending(false);
        }
      }}
    >
      {!isEdit && !embedded && (
        <h2 className="text-lg font-semibold tracking-tight">Produs nou</h2>
      )}

      <div
        className={
          embedded ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Nume</span>
          <Input
            value={name}
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
              if (!slugTouched) setProductSlug(slugifyProduct(next));
            }}
            placeholder="Tricou nord"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Slug</span>
          <Input
            value={productSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setProductSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 60),
              );
            }}
            placeholder="tricou-nord"
            required
            spellCheck={false}
            className="font-mono"
          />
          {productSlug ? (
            <span className="font-mono text-xs text-[var(--muted)]">
              /{productSlug}
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Categorie</span>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="general"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Descriere</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opțional"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Preț bază</span>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="100"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Stoc</span>
          <Input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="10"
            required
          />
        </label>

        <div
          className={
            embedded
              ? "flex flex-col gap-2 text-sm"
              : "flex flex-col gap-1 text-sm sm:col-span-2"
          }
        >
          <span className="font-medium">Imagine</span>
          {(preview || initial?.imageUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview ?? initial?.imageUrl ?? ""}
              alt=""
              className="h-14 w-14 rounded-[var(--radius)] border border-[var(--border)] object-cover"
            />
          )}
          <Input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                setPreview(null);
                return;
              }
              setPreview(URL.createObjectURL(file));
            }}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Activ
          </label>
          {initial?.imageUrl && !preview && (
            <label className="flex items-center gap-2 text-sm">
              <input name="clearImage" type="checkbox" />
              Elimină imaginea
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Se salvează…" : isEdit ? "Salvează" : "Adaugă"}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPreview(null);
              setOpen(false);
            }}
          >
            Anulează
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}
