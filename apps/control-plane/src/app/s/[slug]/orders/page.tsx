import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="display text-3xl">Comenzile mele</h1>
        <p className="text-sm text-[var(--muted)]">
          <Link href={`/login?next=/s/${slug}/orders`} className="underline">
            Autentifică-te
          </Link>{" "}
          pentru a vedea istoricul. Comenzile guest apar pe pagina de confirmare.
        </p>
      </div>
    );
  }

  const orders = await prisma.order.findMany({
    where: { storeId: store.id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-3xl">Comenzile mele</h1>
      {orders.length === 0 ? (
        <p className="text-[var(--muted)]">Nicio comandă.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/s/${slug}/orders/${o.id}`}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div>
                  <p className="font-medium">{o.id.slice(0, 8)}…</p>
                  <p className="text-sm text-[var(--muted)]">
                    {o.createdAt.toLocaleString("ro-RO")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{o.status}</Badge>
                  <span>{formatRon(Number(o.total.toString()))}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
