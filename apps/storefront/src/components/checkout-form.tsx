"use client";

import { useActionState, useId, useMemo } from "react";
import type { ShippingOption } from "@ruleshop/contracts";
import type { ActionState } from "@/app/actions";

/**
 * Checkout form.
 *
 * The idempotency token is minted once when the form mounts and submitted with
 * it, so a double-click, an impatient reload of the POST, or a retry after a
 * timeout all carry the same token and the control plane returns the original
 * order instead of placing a second one.
 */
export function CheckoutForm({
  action,
  shippingOptions,
  requiresEmail,
  formatMoney,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  shippingOptions: ShippingOption[];
  requiresEmail: boolean;
  formatMoney: (value: number) => string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const emailId = useId();

  // Stable for the lifetime of this form instance, which is exactly the scope a
  // single checkout attempt should share.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  // Preselect the cheapest option. Seeded as undefined rather than element 0,
  // which need not exist.
  const cheapest = shippingOptions.reduce<ShippingOption | undefined>(
    (best, option) => (!best || option.cost < best.cost ? option : best),
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

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
              {option.cost === 0 ? "gratuit" : formatMoney(option.cost)}
            </span>
          </label>
        ))}
      </fieldset>

      {requiresEmail && (
        <div className="flex flex-col gap-1">
          <label htmlFor={emailId} className="text-sm">
            Email pentru confirmare
          </label>
          <input
            id={emailId}
            name="guestEmail"
            type="email"
            required
            autoComplete="email"
            className="border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]"
          />
          <p className="text-xs text-[var(--muted)]">
            Cumperi ca oaspete. Vei avea nevoie de acest email pentru a revedea
            comanda mai târziu.
          </p>
        </div>
      )}

      {state?.error && (
        <p
          role="alert"
          className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-sm text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? "Se procesează…" : "Plasează comanda"}
      </button>

      <p className="text-xs text-[var(--muted)]">
        Plata este simulată. Comanda este înregistrată și poate fi consultată
        ulterior.
      </p>
    </form>
  );
}
