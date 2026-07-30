"use server";

import { revalidatePath } from "next/cache";
import { requireStoreRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { saveProductImage } from "@/lib/product-image-upload";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { getTranslator } from "@/i18n/server";

async function storeOrThrow(slug: string) {
  const t = await getTranslator();
  const store = await getStoreBySlug(slug);
  if (!store) throw new Error(t("errors.storeNotFound"));
  return store;
}

async function requiredString(formData: FormData, key: string): Promise<string> {
  const t = await getTranslator();
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(t("errors.fieldRequired", { field: key }));
  return value;
}

export async function upsertProduct(slug: string, formData: FormData) {
  const t = await getTranslator();
  const store = await storeOrThrow(slug);
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) throw new Error(authz.error);

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const name = await requiredString(formData, "name");
  const productSlug = await requiredString(formData, "productSlug");
  const description = String(formData.get("description") ?? "").trim();
  const category = await requiredString(formData, "category");
  const basePrice = Number(formData.get("basePrice"));
  const stock = Number(formData.get("stock"));
  const active = formData.get("active") === "on";

  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error(t("errors.invalidPrice"));
  }
  if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
    throw new Error(t("errors.invalidStock"));
  }

  const image = formData.get("image");
  const clearImage = formData.get("clearImage") === "on";

  let imageUrl: string | null | undefined;
  if (image instanceof File && image.size > 0) {
    imageUrl = await saveProductImage(slug, image);
  } else if (clearImage) {
    imageUrl = null;
  }

  if (id) {
    const existing = await prisma.product.findFirst({
      where: { id, storeId: store.id },
    });
    if (!existing) throw new Error(t("errors.productNotFound"));

    await prisma.product.update({
      where: { id },
      data: {
        name,
        slug: productSlug,
        description,
        category,
        basePrice,
        stock,
        active,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      },
    });
    await writeAudit({
      storeId: store.id,
      userId: authz.session.user.id,
      action: "product.updated",
      entity: "Product",
      entityId: id,
    });
  } else {
    const created = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        slug: productSlug,
        description,
        category,
        basePrice,
        stock,
        active,
        imageUrl: imageUrl ?? null,
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
