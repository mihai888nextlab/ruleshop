import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { formatRon } from "@/lib/utils";
import { DecisionPanel } from "@/components/decision-panel";
import { Badge } from "@/components/ui/badge";
import { StorefrontChrome } from "@/components/storefront-chrome";
import { getTranslator } from "@/i18n/server";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const t = await getTranslator();
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    include: { items: true },
  });
  if (!order) notFound();

  const session = await auth();
  const isOwner =
    (session?.user?.id && order.userId === session.user.id) ||
    session?.user?.platformRole === "PLATFORM_ADMIN";
  // Allow viewing after redirect from checkout (guest) — still store-scoped
  if (!isOwner && order.userId && order.userId !== session?.user?.id) {
    // staff check
    if (session?.user?.id) {
      const m = await prisma.membership.findUnique({
        where: {
          storeId_userId: { storeId: store.id, userId: session.user.id },
        },
      });
      if (!m || m.role === "CUSTOMER") notFound();
    }
  }

  const trace = order.decisionTrace as {
    shipping?: {
      matchedRules?: string[];
      decision?: Record<string, unknown>;
      explanation?: { ruleKey: string; matched: boolean; reason: string }[];
      rulesetVersion?: number;
      traceId?: string;
    };
    fraud?: {
      matchedRules?: string[];
      decision?: Record<string, unknown>;
      explanation?: { ruleKey: string; matched: boolean; reason: string }[];
      traceId?: string;
    };
    loyalty?: {
      matchedRules?: string[];
      decision?: Record<string, unknown>;
    };
  } | null;

  return (
    <StorefrontChrome store={{ id: store.id, slug: store.slug, name: store.name }}>
    <div className="flex flex-col gap-6">
      <div>
        <Badge tone="ok">{order.status}</Badge>
        <h1 className="font-semibold tracking-tight mt-2 text-3xl">
          {t("orders.placed")}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {order.createdAt.toLocaleString("ro-RO")} · ID {order.id}
        </p>
      </div>
      <ul className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between text-sm">
            <span>
              {i.name} × {i.quantity}
            </span>
            <span>{formatRon(Number(i.lineTotal.toString()))}</span>
          </li>
        ))}
        <li className="flex justify-between border-t border-[var(--border)] pt-2 text-sm">
          <span>
            {t("orders.shipping")} ({order.shippingMethod})
          </span>
          <span>{formatRon(Number(order.shippingCost.toString()))}</span>
        </li>
        <li className="flex justify-between font-semibold">
          <span>{t("orders.total")}</span>
          <span>{formatRon(Number(order.total.toString()))}</span>
        </li>
        {order.loyaltyPointsEarned > 0 && (
          <li className="text-sm text-[var(--accent)]">
            {t("orders.loyaltyPoints", { points: order.loyaltyPointsEarned })}
          </li>
        )}
      </ul>
      {trace?.shipping && (
        <DecisionPanel
          title={t("orders.shippingDecision")}
          matchedRules={trace.shipping.matchedRules}
          rulesetVersion={trace.shipping.rulesetVersion}
          explanation={trace.shipping.explanation}
          decision={trace.shipping.decision}
          traceId={trace.shipping.traceId}
          compact
        />
      )}
      {trace?.fraud && (
        <DecisionPanel
          title={t("orders.fraudDecision")}
          matchedRules={trace.fraud.matchedRules}
          explanation={trace.fraud.explanation}
          decision={trace.fraud.decision}
          traceId={trace.fraud.traceId}
          compact
        />
      )}
    </div>
    </StorefrontChrome>
  );
}
