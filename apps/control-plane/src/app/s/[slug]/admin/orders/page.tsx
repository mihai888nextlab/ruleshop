import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { updateOrderStatus } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  const orders = await prisma.order.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="display text-3xl">Comenzi magazin</h1>
        <Link href={`/s/${slug}/admin/products`} className="text-sm underline">
          Produse
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li
            key={o.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link
                  href={`/s/${slug}/orders/${o.id}`}
                  className="font-medium underline"
                >
                  {o.id.slice(0, 10)}…
                </Link>
                <p className="text-sm text-[var(--muted)]">
                  {o.createdAt.toLocaleString("ro-RO")} ·{" "}
                  {formatRon(Number(o.total.toString()))} ·{" "}
                  {o.items.length} produse
                </p>
              </div>
              <Badge>{o.status}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["PAID", "SHIPPED", "CANCELLED"] as const).map((st) => (
                <form
                  key={st}
                  action={async () => {
                    "use server";
                    await updateOrderStatus(slug, o.id, st);
                  }}
                >
                  <Button type="submit" size="sm" variant="outline">
                    {st}
                  </Button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
