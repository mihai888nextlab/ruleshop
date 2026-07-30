import { notFound, redirect } from "next/navigation";
import { updateOrderStatus } from "@/app/actions/admin";
import { PageHeader } from "@/components/dashboard/shell";
import { OrderList } from "@/components/lists/order-list";
import { getTranslator } from "@/i18n/server";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

export default async function AdminOrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/admin/orders`);

  const t = await getTranslator();

  const orders = await prisma.order.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("orders.title")} />

      {orders.length === 0 ? (
        <div className="panel px-5 py-12 text-center text-sm text-[var(--muted)]">
          {t("orders.empty")}
        </div>
      ) : (
        <OrderList
          slug={slug}
          updateStatus={updateOrderStatus}
          orders={orders.map((o) => ({
            id: o.id,
            status: o.status,
            total: Number(o.total.toString()),
            itemCount: o.items.length,
            createdAt: o.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
