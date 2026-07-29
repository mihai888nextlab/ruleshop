import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateGuestId } from "@/lib/store";

export async function getCartForStore(storeId: string) {
  const session = await auth();
  const guestId = await getOrCreateGuestId();

  let cart = session?.user?.id
    ? await prisma.cart.findFirst({
        where: { storeId, userId: session.user.id },
        include: { items: { include: { product: true } } },
      })
    : await prisma.cart.findFirst({
        where: { storeId, guestId },
        include: { items: { include: { product: true } } },
      });

  if (!cart) {
    cart = await prisma.cart.create({
      data: {
        storeId,
        userId: session?.user?.id,
        guestId: session?.user?.id ? null : guestId,
      },
      include: { items: { include: { product: true } } },
    });
  }

  return cart;
}

export function cartSubtotal(
  items: { quantity: number; product: { basePrice: { toString(): string } } }[],
) {
  return items.reduce(
    (sum, i) => sum + i.quantity * Number(i.product.basePrice.toString()),
    0,
  );
}
