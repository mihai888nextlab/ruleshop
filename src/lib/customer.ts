import type { Session } from "next-auth";

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
