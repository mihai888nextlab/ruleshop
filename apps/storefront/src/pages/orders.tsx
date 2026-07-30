import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "@/components/decision-note";
import { getOrders } from "@/lib/api";
import type { OrderSummary } from "@/lib/types";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function OrdersPage() {
  const { authenticated } = useRuleShop();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void (async () => {
      const result = await getOrders();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOrders(result.data.orders);
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16">
        <h1 className="display text-3xl">Comenzi</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          <Link to="/login" className="underline">
            Autentifică-te
          </Link>{" "}
          pentru a vedea istoricul.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10">
      <h1 className="display text-4xl">Comenzi</h1>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {orders === null ? (
        <p className="text-sm text-[var(--muted)]">Se încarcă…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nicio comandă încă.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/orders/${order.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] py-3"
              >
                <span className="font-medium">{order.id.slice(0, 8)}…</span>
                <span className="text-sm text-[var(--muted)]">{order.status}</span>
                <span className="text-sm font-medium">{money(order.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
