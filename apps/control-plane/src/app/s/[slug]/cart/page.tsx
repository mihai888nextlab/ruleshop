import Link from "next/link";
import { notFound } from "next/navigation";
import { getCartForStore, cartSubtotal } from "@/lib/cart";
import { getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { removeCartItem, updateCartItem } from "@/app/actions/cart";
import { Button } from "@/components/ui/button";
import { StorefrontChrome } from "@/components/storefront-chrome";

export default async function CartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const cart = await getCartForStore(store.id);
  const subtotal = cartSubtotal(cart.items);

  return (
    <StorefrontChrome store={{ id: store.id, slug: store.slug, name: store.name }}>
    <div className="flex flex-col gap-6">
      <h1 className="font-semibold tracking-tight text-3xl">Coș</h1>
      {cart.items.length === 0 ? (
        <p className="text-[var(--muted)]">
          Coșul este gol.{" "}
          <Link href={`/s/${slug}`} className="text-[var(--accent)] underline">
            Continuă cumpărăturile
          </Link>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {cart.items.map((item) => {
              const price = Number(item.product.basePrice.toString());
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div>
                    <Link
                      href={`/s/${slug}/products/${item.product.slug}`}
                      className="font-medium hover:underline"
                    >
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-[var(--muted)]">
                      {formatRon(price)} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form
                      action={async () => {
                        "use server";
                        await updateCartItem(slug, item.id, item.quantity - 1);
                      }}
                    >
                      <Button type="submit" variant="outline" size="sm">
                        −
                      </Button>
                    </form>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <form
                      action={async () => {
                        "use server";
                        await updateCartItem(slug, item.id, item.quantity + 1);
                      }}
                    >
                      <Button type="submit" variant="outline" size="sm">
                        +
                      </Button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await removeCartItem(slug, item.id);
                      }}
                    >
                      <Button type="submit" variant="ghost" size="sm">
                        Șterge
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
            <p className="text-lg">
              Subtotal (preț de bază):{" "}
              <strong>{formatRon(subtotal)}</strong>
            </p>
            <Link href={`/s/${slug}/checkout`}>
              <Button size="lg">Checkout</Button>
            </Link>
          </div>
        </>
      )}
    </div>
    </StorefrontChrome>
  );
}
