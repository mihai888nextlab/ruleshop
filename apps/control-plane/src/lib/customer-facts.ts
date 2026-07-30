import { prisma } from "./prisma";
import type { ApiIdentity } from "./api-identity";

/**
 * Builds the `customer.*` half of the decision context.
 *
 * These are facts, not conclusions: the engine decides what they mean. Nothing
 * here encodes a business policy, so "who gets a discount" lives entirely in
 * published rules and can change without a deploy.
 *
 * Tier is the one derived value, kept because rules read it as a convenience.
 * It is computed from loyalty points rather than from the email address, so it
 * reflects real customer state. Store-specific segmentation belongs in
 * admin-defined customer attributes instead.
 */

const VIP_POINTS_THRESHOLD = 400;

export interface CustomerFacts {
  isGuest: boolean;
  verified: boolean;
  userId: string | null;
  email: string | null;
  loyaltyPoints: number;
  tier: "guest" | "standard" | "vip";
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  isFirstOrder: boolean;
  /** Admin-defined per-store attributes, filled from the customer profile. */
  attributes: Record<string, unknown>;
}

export function guestFacts(): CustomerFacts {
  return {
    isGuest: true,
    verified: false,
    userId: null,
    email: null,
    loyaltyPoints: 0,
    tier: "guest",
    orderCount: 0,
    totalSpent: 0,
    avgOrderValue: 0,
    isFirstOrder: true,
    attributes: {},
  };
}

export async function buildCustomerFacts(
  storeId: string,
  identity: ApiIdentity,
): Promise<CustomerFacts> {
  if (identity.kind === "guest") return guestFacts();

  const [user, membership, orderStats, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: identity.userId },
      select: { id: true, email: true },
    }),
    prisma.membership.findUnique({
      where: {
        storeId_userId: { storeId, userId: identity.userId },
      },
      select: { loyaltyPoints: true },
    }),
    // Order history is scoped to this store: a customer's standing in one shop
    // must not leak into another's decisions.
    prisma.order.aggregate({
      where: { storeId, userId: identity.userId, status: { not: "BLOCKED" } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    // Administrator-defined attributes, also per store, so the same shopper can
    // carry different attributes in different shops.
    prisma.customerProfile.findUnique({
      where: { storeId_userId: { storeId, userId: identity.userId } },
      select: { values: true },
    }),
  ]);

  if (!user || !membership) return guestFacts();

  const orderCount = orderStats._count._all;
  const totalSpent = Number(orderStats._sum.total ?? 0);
  const loyaltyPoints = membership.loyaltyPoints;

  return {
    isGuest: false,
    verified: true,
    userId: user.id,
    email: user.email,
    loyaltyPoints,
    tier: loyaltyPoints >= VIP_POINTS_THRESHOLD ? "vip" : "standard",
    orderCount,
    totalSpent,
    avgOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
    isFirstOrder: orderCount === 0,
    attributes: readAttributes(profile?.values),
  };
}

/**
 * Stored profile values are already validated against the store's definitions
 * on write, so this only has to guard against a malformed JSON column.
 */
function readAttributes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}
