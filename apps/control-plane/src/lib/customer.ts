import type { Session } from "next-auth";
import { prisma } from "./prisma";

export function customerContext(session: Session | null, loyaltyPoints = 0) {
  const isVip =
    session?.user?.email?.includes("vip") || loyaltyPoints >= 400;
  return {
    isGuest: !session?.user,
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    tier: isVip ? "vip" : "standard",
    loyaltyPoints,
    verified: Boolean(session?.user),
  };
}

/** Per-store loyalty balance for the signed-in staff/customer session. */
export async function storeLoyaltyPoints(
  storeId: string,
  userId: string | undefined,
): Promise<number> {
  if (!userId) return 0;
  const membership = await prisma.membership.findUnique({
    where: { storeId_userId: { storeId, userId } },
    select: { loyaltyPoints: true },
  });
  return membership?.loyaltyPoints ?? 0;
}
