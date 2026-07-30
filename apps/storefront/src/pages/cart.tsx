import { Link } from "react-router-dom";
import { money } from "@/components/decision-note";
import { LoyaltyEarnNote } from "@/components/loyalty";
import { emptyCart, setCartItem } from "@/lib/api";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function CartPage() {
  const { cart, refreshCart } = useRuleShop();

  if (!cart) {
    return (
      <div className="mx-auto max-w-[1120px] px-5 py-16 text-sm text-[var(--muted)]">
        Se încarcă…
      </div>
    );
  }

  async function updateQty(productSlug: string, quantity: number) {
    await setCartItem(productSlug, quantity);
    await refreshCart();
  }

  async function clear() {
    await emptyCart();
    await refreshCart();
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <h1 className="display text-4xl">Coș</h1>

      {cart.lines.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Coșul este gol.{" "}
          <Link to="/" className="underline">
            Înapoi la catalog
          </Link>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {cart.lines.map((line) => (
              <li
                key={line.productSlug}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-3"
              >
                <div>
                  <Link
                    to={`/products/${line.productSlug}`}
                    className="font-medium"
                  >
                    {line.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {money(line.unitPrice)} × {line.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={line.quantity}
                    className="field w-16 text-center"
                    onBlur={(e) => {
                      const qty = Number(e.target.value);
                      if (Number.isFinite(qty)) {
                        void updateQty(line.productSlug, qty);
                      }
                    }}
                  />
                  <span className="text-sm font-medium">
                    {money(line.lineTotal)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-medium">
                Subtotal {money(cart.subtotal)}
              </p>
              <LoyaltyEarnNote
                earned={cart.loyalty.points}
                decision={cart.loyalty.decision}
                className="mt-1"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => void clear()} className="btn btn-ghost">
                Golește
              </button>
              <Link to="/checkout" className="btn">
                Checkout
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
