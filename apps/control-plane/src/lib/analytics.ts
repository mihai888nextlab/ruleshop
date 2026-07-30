import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

export type AnalyticsRange = "7" | "30" | "all";

export function parseAnalyticsRange(raw: string | undefined): AnalyticsRange {
  if (raw === "7" || raw === "all") return raw;
  return "30";
}

export function rangeSince(range: AnalyticsRange): Date | null {
  if (range === "all") return null;
  const days = range === "7" ? 7 : 30;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function matchedKeysOf(raw: unknown): string[] {
  return Array.isArray(raw)
    ? (raw as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
}

export type StoreAnalytics = {
  range: AnalyticsRange;
  since: string | null;
  orderCount: number;
  revenue: number;
  aov: number;
  evaluationCount: number;
  canaryCount: number;
  stableCount: number;
  canaryPercent: number;
  bestSellers: {
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }[];
  ordersByStatus: { status: string; count: number }[];
  ordersOverTime: { day: string; count: number; revenue: number }[];
  evaluationsByType: { type: string; count: number }[];
  topRules: { key: string; hits: number }[];
};

export async function getStoreAnalytics(
  storeId: string,
  range: AnalyticsRange,
): Promise<StoreAnalytics> {
  const since = rangeSince(range);
  const createdAt = since ? { gte: since } : undefined;

  const [orders, evaluations] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, ...(createdAt ? { createdAt } : {}) },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            name: true,
            quantity: true,
            lineTotal: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.evaluation.findMany({
      where: { storeId, ...(createdAt ? { createdAt } : {}) },
      select: {
        decisionType: true,
        isCanary: true,
        matchedRules: true,
      },
    }),
  ]);

  const paidLike = orders.filter((o) => o.status !== "CANCELLED");
  const revenue = paidLike.reduce(
    (sum, o) => sum + decimalToNumber(o.total),
    0,
  );
  const orderCount = orders.length;
  const aov = paidLike.length > 0 ? revenue / paidLike.length : 0;

  const productMap = new Map<
    string,
    { productId: string; name: string; quantity: number; revenue: number }
  >();
  for (const order of paidLike) {
    for (const item of order.items) {
      const prev = productMap.get(item.productId);
      const line = decimalToNumber(item.lineTotal);
      if (prev) {
        prev.quantity += item.quantity;
        prev.revenue += line;
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          revenue: line,
        });
      }
    }
  }
  const bestSellers = [...productMap.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10);

  const statusMap = new Map<string, number>();
  for (const order of orders) {
    statusMap.set(order.status, (statusMap.get(order.status) ?? 0) + 1);
  }
  const ordersByStatus = [...statusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const dayMap = new Map<string, { count: number; revenue: number }>();
  for (const order of orders) {
    const key = dayKey(order.createdAt);
    const prev = dayMap.get(key) ?? { count: 0, revenue: 0 };
    prev.count += 1;
    if (order.status !== "CANCELLED") {
      prev.revenue += decimalToNumber(order.total);
    }
    dayMap.set(key, prev);
  }
  const ordersOverTime = [...dayMap.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const typeMap = new Map<string, number>();
  let canaryCount = 0;
  const ruleHits = new Map<string, number>();
  for (const ev of evaluations) {
    typeMap.set(ev.decisionType, (typeMap.get(ev.decisionType) ?? 0) + 1);
    if (ev.isCanary) canaryCount += 1;
    for (const key of matchedKeysOf(ev.matchedRules)) {
      ruleHits.set(key, (ruleHits.get(key) ?? 0) + 1);
    }
  }
  const evaluationCount = evaluations.length;
  const stableCount = evaluationCount - canaryCount;
  const canaryPercent =
    evaluationCount > 0 ? (canaryCount / evaluationCount) * 100 : 0;

  const evaluationsByType = [...typeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const topRules = [...ruleHits.entries()]
    .map(([key, hits]) => ({ key, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 15);

  return {
    range,
    since: since?.toISOString() ?? null,
    orderCount,
    revenue,
    aov,
    evaluationCount,
    canaryCount,
    stableCount,
    canaryPercent,
    bestSellers,
    ordersByStatus,
    ordersOverTime,
    evaluationsByType,
    topRules,
  };
}
