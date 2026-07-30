import { Link } from "react-router-dom";
import { CheckoutForm } from "@/components/checkout-form";
import { money } from "@/components/decision-note";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function CheckoutPage() {
  const { cart } = useRuleShop();

  if (!cart) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16 text-sm text-[var(--muted)]">
        Se încarcă…
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16">
        <h1 className="display text-3xl">Checkout</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Coșul este gol.{" "}
          <Link to="/" className="underline">
            Înapoi la catalog
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <h1 className="display text-4xl">Checkout</h1>
      <p className="text-sm text-[var(--muted)]">
        Subtotal {money(cart.subtotal)} · {cart.lines.length} linii
      </p>
      <CheckoutForm
        shippingOptions={cart.shippingOptions}
        requiresEmail={!cart.viewer.authenticated}
      />
    </div>
  );
}
