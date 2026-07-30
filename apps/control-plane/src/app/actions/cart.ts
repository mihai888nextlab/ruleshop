"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCartForStore } from "@/lib/cart";
import { getStoreBySlug } from "@/lib/store";
import { getTranslator } from "@/i18n/server";

export async function addToCart(slug: string, productId: string, qty = 1) {
  const t = await getTranslator();
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error(t("errors.storeNotFound"));
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: store.id, active: true },
  });
  if (!product) throw new Error(t("errors.productNotFound"));

  const cart = await getCartForStore(store.id);
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + qty },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, quantity: qty },
    });
  }
  revalidatePath(`/s/${slug}`);
  revalidatePath(`/s/${slug}/cart`);
}

export async function updateCartItem(
  slug: string,
  itemId: string,
  quantity: number,
) {
  const t = await getTranslator();
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error(t("errors.storeNotFound"));
  const cart = await getCartForStore(store.id);
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new Error(t("errors.itemNotFound"));
  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
  } else {
    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }
  revalidatePath(`/s/${slug}/cart`);
}

export async function removeCartItem(slug: string, itemId: string) {
  await updateCartItem(slug, itemId, 0);
}
