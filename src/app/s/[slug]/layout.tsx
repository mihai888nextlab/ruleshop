import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { auth } from "@/lib/auth";
import { customerContext } from "@/lib/customer";
import { runDecision } from "@/lib/decide";
import { getOrCreateGuestId, getStoreBySlug } from "@/lib/store";
import { prisma } from "@/lib/prisma";

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

  let userPoints = 0;
  if (session?.user?.id) {
    const u = await prisma.user.findUnique({ where: { id: session.user.id } });
    userPoints = u?.loyaltyPoints ?? 0;
  }

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
    <div className="mesh min-h-screen" data-theme={themeId}>
      <SiteHeader store={{ id: store.id, slug: store.slug, name: store.name }} />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
