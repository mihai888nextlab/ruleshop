import { notFound, redirect } from "next/navigation";
import { upsertProduct } from "@/app/actions/admin";
import { PageHeader } from "@/components/dashboard/shell";
import { ProductList } from "@/components/lists/product-list";
import { getTranslator } from "@/i18n/server";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

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

  const t = await getTranslator();

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("products.title")} />

      <ProductList
        slug={slug}
        upsertProduct={upsertProduct}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          category: p.category,
          basePrice: Number(p.basePrice.toString()),
          stock: p.stock,
          active: p.active,
          imageUrl: p.imageUrl,
        }))}
      />
    </div>
  );
}
