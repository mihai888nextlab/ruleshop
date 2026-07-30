import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { checkout } from "@/lib/api";
import { money } from "@/components/decision-note";
import type { ShippingOption } from "@/lib/types";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function CheckoutForm({
  shippingOptions,
  requiresEmail,
}: {
  shippingOptions: ShippingOption[];
  requiresEmail: boolean;
}) {
  const navigate = useNavigate();
  const { refreshCart } = useRuleShop();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const cheapest = shippingOptions.reduce<ShippingOption | undefined>(
    (best, option) => (!best || option.cost < best.cost ? option : best),
    undefined,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const shippingMethod = String(form.get("shippingMethod") ?? "");
    const guestEmail = form.get("guestEmail")
      ? String(form.get("guestEmail"))
      : undefined;

    const result = await checkout({
      shippingMethod,
      guestEmail,
      idempotencyKey,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await refreshCart();
    navigate(`/orders/${result.data.order.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Metodă de livrare
        </legend>
        <p className="text-xs text-[var(--muted)]">
          Opțiunile și costurile sunt produse de reguli, nu fixate în cod.
        </p>

        {shippingOptions.map((option) => (
          <label
            key={option.method}
            className="flex cursor-pointer items-center gap-3 border-b border-[var(--border)] py-2.5 text-sm"
          >
            <input
              type="radio"
              name="shippingMethod"
              value={option.method}
              defaultChecked={option.method === cheapest?.method}
              required
            />
            <span className="flex-1">{option.label ?? option.method}</span>
            <span>
              {option.cost === 0 ? "gratuit" : money(option.cost)}
            </span>
          </label>
        ))}
      </fieldset>

      {requiresEmail && (
        <div className="flex flex-col gap-1">
          <label htmlFor="guestEmail" className="text-sm">
            Email pentru confirmare
          </label>
          <input
            id="guestEmail"
            name="guestEmail"
            type="email"
            required
            placeholder="tu@exemplu.ro"
            className="field"
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn disabled:opacity-60">
        {pending ? "Se plasează…" : "Plasează comanda"}
      </button>
    </form>
  );
}
