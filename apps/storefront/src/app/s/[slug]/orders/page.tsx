import Link from "next/link";
import { redirect } from "next/navigation";
import { money } from "@/components/decision-note";
import { getOrders } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "în așteptare",
  PAID: "plătită",
  SHIPPED: "expediată",
  CANCELLED: "anulată",
  BLOCKED: "blocată",
};

/**
 * Order history for the signed-in customer, scoped to this store.
 */
export default async function OrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getOrders(slug);

  if (!result.ok) {
    if (result.status === 401) redirect(`/s/${slug}/login`);
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Comenzile nu pot fi afișate</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  const { orders } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display border-b border-[var(--border)] pb-4 text-4xl">
        Comenzile mele
      </h1>

      {orders.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[var(--muted)]">Nicio comandă încă.</p>
          <Link
            href={`/s/${slug}`}
            className="mt-3 inline-block border border-[var(--accent)] px-4 py-2 text-sm"
          >
            Vezi catalogul
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col">
          {orders.map((order) => (
            <li key={order.id} className="border-b border-[var(--border)]">
              <Link
                href={`/s/${slug}/orders/${order.id}`}
                className="flex flex-wrap items-baseline justify-between gap-3 py-4 hover:opacity-70"
              >
                <div>
                  <p className="text-sm">
                    {new Date(order.createdAt).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {order.items.length}{" "}
                    {order.items.length === 1 ? "produs" : "produse"} ·{" "}
                    {STATUS_LABELS[order.status] ?? order.status}
                    {order.loyaltyPointsEarned > 0 &&
                      ` · +${order.loyaltyPointsEarned} puncte`}
                  </p>
                </div>
                <p className="text-lg">{money(order.total)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
