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
import { PageHeader } from "@/components/dashboard/shell";
import { BuiltinFieldsList } from "@/components/lists/builtin-fields-list";
import { requireStoreRole } from "@/lib/auth";
import { loadStoreAttributes } from "@/lib/context-schema";
import { getStoreBySlug } from "@/lib/store";

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
      <PageHeader title="Schema clientului" />

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
        <h2 className="text-xl font-semibold tracking-tight">
          Câmpuri predefinite
        </h2>
        <BuiltinFieldsList
          fields={BUILTIN_FIELDS.map((field) => ({
            path: field.path,
            label: field.label,
            type: field.type,
            operators: [...OPERATORS_BY_TYPE[field.type]],
            availableIn: field.availableIn ? [...field.availableIn] : null,
          }))}
        />
      </section>
    </div>
  );
}
