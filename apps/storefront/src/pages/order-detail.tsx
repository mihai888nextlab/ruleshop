import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DecisionTrace, money } from "@/components/decision-note";
import { getOrder } from "@/lib/api";
import type { OrderDetailResponse } from "@/lib/types";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getOrder(orderId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16">
        <h1 className="display text-3xl">Comandă</h1>
        <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
        <Link to="/orders" className="mt-4 inline-block text-sm underline">
          Înapoi
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16 text-sm text-[var(--muted)]">
        Se încarcă…
      </div>
    );
  }

  const { order, decisions } = data;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10">
      <Link to="/orders" className="text-sm text-[var(--muted)]">
        ← Comenzi
      </Link>
      <h1 className="display text-4xl">Comandă</h1>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--muted)]">Status</dt>
          <dd className="font-medium">{order.status}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Total</dt>
          <dd className="font-medium">{money(order.total)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        {decisions.pricing.map((d, i) => (
          <DecisionTrace key={i} title={`Preț ${i + 1}`} decision={d} />
        ))}
        {decisions.shipping && (
          <DecisionTrace title="Livrare" decision={decisions.shipping} />
        )}
        {decisions.fraud && (
          <DecisionTrace title="Fraudă" decision={decisions.fraud} />
        )}
        {decisions.loyalty && (
          <DecisionTrace title="Loyalty" decision={decisions.loyalty} />
        )}
      </div>
    </div>
  );
}
