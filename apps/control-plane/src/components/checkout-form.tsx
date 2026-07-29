"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function CheckoutForm({
  slug,
  isGuest,
  shippingOptions,
  placeOrder,
}: {
  slug: string;
  isGuest: boolean;
  shippingOptions: { method: string; cost: number; label?: string }[];
  placeOrder: (
    slug: string,
    formData: FormData,
  ) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      action={async (fd) => {
        setLoading(true);
        setError("");
        const res = await placeOrder(slug, fd);
        if (res?.error) {
          setError(res.error);
          setLoading(false);
        }
      }}
    >
      {isGuest && (
        <label className="flex flex-col gap-1 text-sm">
          Email (guest)
          <Input name="guestEmail" type="email" required />
        </label>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Livrare</legend>
        {shippingOptions.map((o) => (
          <label key={o.method} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="shippingMethod"
              value={o.method}
              defaultChecked={o === shippingOptions[0]}
              required
            />
            {o.label ?? o.method} — {o.cost.toFixed(2)} RON
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-[var(--muted)]">
        Plata este simulată — comanda trece direct în starea plătită.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "Se plasează…" : "Plasează comanda"}
      </Button>
    </form>
  );
}
