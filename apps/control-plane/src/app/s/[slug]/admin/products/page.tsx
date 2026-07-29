import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { ProductAdminForm } from "@/components/product-admin-form";
import { upsertProduct } from "@/app/actions/admin";

export default async function AdminProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/admin/products`);

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl">Administrare produse</h1>
        <Link href={`/s/${slug}/admin/orders`} className="text-sm underline">
          Comenzi admin
        </Link>
      </div>
      <ProductAdminForm slug={slug} upsertProduct={upsertProduct} />
      <ul className="flex flex-col gap-2">
        {products.map((p) => (
          <li
            key={p.id}
            className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-medium">
                {p.name}{" "}
                <span className="text-sm text-[var(--muted)]">/{p.slug}</span>
              </p>
              <p className="text-sm text-[var(--muted)]">
                {p.category} · stoc {p.stock} ·{" "}
                {formatRon(Number(p.basePrice.toString()))}
                {!p.active && " · inactiv"}
              </p>
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
                basePrice: Number(p.basePrice.toString()),
                stock: p.stock,
                active: p.active,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
