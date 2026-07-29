"use server";

import { revalidatePath } from "next/cache";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

async function storeOrThrow(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error("Magazin inexistent");
  return store;
}

export async function upsertProduct(
  slug: string,
  data: {
    id?: string;
    name: string;
    productSlug: string;
    description: string;
    category: string;
    basePrice: number;
    stock: number;
    active: boolean;
  },
) {
  const store = await storeOrThrow(slug);
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) throw new Error(authz.error);

  if (data.id) {
    const existing = await prisma.product.findFirst({
      where: { id: data.id, storeId: store.id },
    });
    if (!existing) throw new Error("Produs inexistent");
    await prisma.product.update({
      where: { id: data.id },
      data: {
        name: data.name,
        slug: data.productSlug,
        description: data.description,
        category: data.category,
        basePrice: data.basePrice,
        stock: data.stock,
        active: data.active,
      },
    });
    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "product.updated",
      entity: "Product",
      entityId: data.id,
    });
  } else {
    const created = await prisma.product.create({
      data: {
        storeId: store.id,
        name: data.name,
        slug: data.productSlug,
        description: data.description,
        category: data.category,
        basePrice: data.basePrice,
        stock: data.stock,
        active: data.active,
      },
    });
    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "product.created",
      entity: "Product",
      entityId: created.id,
    });
  }
  revalidatePath(`/s/${slug}/admin/products`);
  revalidatePath(`/s/${slug}`);
}

export async function updateOrderStatus(
  slug: string,
  orderId: string,
  status: "PENDING" | "PAID" | "SHIPPED" | "CANCELLED" | "BLOCKED",
) {
  const store = await storeOrThrow(slug);
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) throw new Error(authz.error);
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
  });
  if (!order) throw new Error("Comandă inexistentă");
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  await writeAudit({
    storeId: store.id,
    userId: authz.session.user.id,
    action: "order.status",
    entity: "Order",
    entityId: orderId,
    meta: { status },
  });
  revalidatePath(`/s/${slug}/admin/orders`);
}
