import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { customerContext, storeLoyaltyPoints } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";

/**
 * Store theme shell only. Storefront pages add StorefrontChrome; admin pages
 * add StoreDashboard so the two UIs can diverge without fighting over chrome.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const session = await auth();
  const guestId = await getOrCreateGuestId();
  const subjectKey = session?.user?.id
    ? `user:${session.user.id}`
    : `guest:${guestId}`;

  const userPoints = await storeLoyaltyPoints(store.id, session?.user?.id);

  const themeDecision = await runDecision({
    storeId: store.id,
    decisionType: "theme",
    context: {
      store: { slug: store.slug, id: store.id },
      customer: customerContext(session, userPoints),
    },
    subjectKey,
    persist: false,
  });

  const themeId =
    typeof themeDecision.decision.themeId === "string"
      ? themeDecision.decision.themeId
      : store.slug === "electronics"
        ? "circuit"
        : "nord";

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--fg)]"
      data-theme={themeId}
    >
      {children}
    </div>
  );
}
