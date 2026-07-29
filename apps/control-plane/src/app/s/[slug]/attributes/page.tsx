import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BUILTIN_FIELDS, OPERATORS_BY_TYPE } from "@ruleshop/engine";
import type { FieldType } from "@ruleshop/engine";
import {
  archiveAttribute,
  createAttribute,
  deleteAttribute,
  updateAttribute,
} from "@/app/actions/attributes";
import {
  AttributeManager,
  type AttributeRow,
} from "@/components/attribute-manager";
import { Badge } from "@/components/ui/badge";
import { requireStoreRole } from "@/lib/auth";
import { loadStoreAttributes } from "@/lib/context-schema";
import { getStoreBySlug } from "@/lib/store";

/**
 * Schema administration: the vocabulary rules are written against.
 *
 * Built-in fields are listed read-only alongside the store's own attributes, so
 * an author can see the whole vocabulary in one place rather than discovering it
 * from the editor's dropdown.
 */
export default async function AttributesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/attributes`);

  const defs = await loadStoreAttributes(store.id, { includeArchived: true });

  const attributes: AttributeRow[] = defs.map((def) => ({
    id: def.id,
    key: def.key,
    label: def.label,
    description: def.description,
    type: def.type as FieldType,
    options: Array.isArray(def.options)
      ? (def.options as unknown[]).filter(
          (o): o is string => typeof o === "string",
        )
      : [],
    required: def.required,
    showOnProfile: def.showOnProfile,
    archived: def.archived,
  }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          href={`/s/${slug}/rules`}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          ← Control plane
        </Link>
        <h1 className="display mt-1 text-3xl">Schema clientului</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Câmpurile definite aici extind vocabularul regulilor pentru{" "}
          <strong>{store.name}</strong>. Fiecare atribut devine o variabilă
          tipizată în editorul de reguli și un câmp în profilul clientului, iar
          tipul lui decide ce operatori sunt permiși.
        </p>
      </header>

      {/*
        Server Actions are bound with the store slug rather than wrapped in
        arrow functions. A closure created here is an ordinary function and
        cannot cross into a Client Component; `bind` produces a real action
        reference that can.
      */}
      <AttributeManager
        attributes={attributes}
        actions={{
          onCreate: createAttribute.bind(null, slug),
          onUpdate: updateAttribute.bind(null, slug),
          onArchive: archiveAttribute.bind(null, slug),
          onDelete: deleteAttribute.bind(null, slug),
        }}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Câmpuri predefinite</h2>
        <p className="text-sm text-[var(--muted)]">
          Furnizate întotdeauna de platformă. Disponibilitatea diferă în funcție
          de tipul deciziei: un produs nu există în contextul unei verificări
          antifraudă.
        </p>

        <ul className="grid gap-2 sm:grid-cols-2">
          {BUILTIN_FIELDS.map((field) => (
            <li
              key={field.path}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{field.label}</span>
                <Badge tone="muted">{field.type}</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">
                {field.path}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Operatori: {OPERATORS_BY_TYPE[field.type].join(", ")}
              </p>
              {field.availableIn && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Doar pentru: {field.availableIn.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
