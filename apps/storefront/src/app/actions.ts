"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as api from "@/lib/api";
import { clearSessionToken, setSessionToken } from "@/lib/session";

/**
 * Storefront mutations.
 *
 * These are thin: validation, pricing, stock and fraud decisions all belong to
 * the control plane. What happens here is translating a form submission into an
 * API call and turning the result into either a redirect or a message the page
 * can render.
 */

export type ActionState = { error?: string; notice?: string } | null;

export async function updateCartItem(
  slug: string,
  productSlug: string,
  quantity: number,
): Promise<ActionState> {
  const result = await api.setCartItem(slug, productSlug, quantity);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/s/${slug}/cart`);
  revalidatePath(`/s/${slug}`);
  return null;
}

export async function addToCart(
  slug: string,
  productSlug: string,
  formData: FormData,
): Promise<ActionState> {
  const raw = Number(formData.get("quantity") ?? 1);
  const quantity = Number.isFinite(raw) ? Math.min(99, Math.max(1, raw)) : 1;

  const result = await api.setCartItem(slug, productSlug, quantity);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/s/${slug}/cart`);
  redirect(`/s/${slug}/cart`);
}

export async function clearCart(slug: string): Promise<ActionState> {
  const result = await api.emptyCart(slug);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/s/${slug}/cart`);
  return null;
}

export async function placeOrder(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const shippingMethod = String(formData.get("shippingMethod") ?? "").trim();
  if (!shippingMethod) {
    return { error: "Alege o metodă de livrare" };
  }

  const guestEmailRaw = String(formData.get("guestEmail") ?? "").trim();

  /**
   * The idempotency token is minted per submission attempt and carried in the
   * form, so a double-click or a reload of the POST reuses it and the control
   * plane returns the original order rather than placing a second one.
   */
  const idempotencyKey =
    String(formData.get("idempotencyKey") ?? "").trim() || randomUUID();

  const result = await api.checkout(slug, {
    shippingMethod,
    guestEmail: guestEmailRaw || undefined,
    idempotencyKey,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath(`/s/${slug}/cart`);
  revalidatePath(`/s/${slug}/orders`);

  // Guests have no session to list orders against, so the email is carried into
  // the confirmation link to keep the order reachable afterwards.
  const query = guestEmailRaw
    ? `?email=${encodeURIComponent(guestEmailRaw)}`
    : "";
  redirect(`/s/${slug}/orders/${result.data.order.id}${query}`);
}

export async function signIn(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completează emailul și parola" };
  }

  const result = await api.login(slug, email, password);
  if (!result.ok) return { error: result.error };

  await setSessionToken(result.data.token);

  // The cart is re-read after sign-in so the guest cart merge is reflected.
  revalidatePath(`/s/${slug}`, "layout");
  redirect(`/s/${slug}`);
}

export async function signUp(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const result = await api.register(slug, {
    email,
    password,
    name: name || undefined,
  });
  if (!result.ok) return { error: result.error };

  await setSessionToken(result.data.token);
  revalidatePath(`/s/${slug}`, "layout");
  redirect(`/s/${slug}`);
}

export async function signOut(slug: string): Promise<void> {
  await clearSessionToken();
  revalidatePath(`/s/${slug}`, "layout");
  redirect(`/s/${slug}`);
}

export async function saveProfile(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  /**
   * Field types are the store's business, not the storefront's: whatever the
   * form holds is forwarded and the control plane coerces and validates it
   * against the attribute definitions.
   */
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attr:")) {
      values[key.slice(5)] = typeof value === "string" ? value : "";
    }
  }

  const result = await api.saveProfile(slug, values);
  if (!result.ok) return { error: result.error };

  if (!result.data.ok) {
    const messages = Object.values(result.data.errors);
    return { error: messages.join(" · ") || "Datele nu au putut fi salvate" };
  }

  // Attributes feed the decision context, so a saved profile can change prices.
  revalidatePath(`/s/${slug}`, "layout");
  return { notice: "Profil salvat. Regulile folosesc noile valori imediat." };
}
