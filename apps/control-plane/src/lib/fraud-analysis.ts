import { prisma } from "./prisma";

/**
 * Fraud statistics, computed from what actually happened.
 *
 * Every figure below is derived from real rows: orders the fraud rules refused,
 * orders they let through, and the recorded fraud evaluations behind them. This
 * is the input the AI module is allowed to reason about — the model classifies
 * incidents and suggests thresholds, but it never supplies a number, because a
 * block rate is something the database knows and a model would only guess.
 *
 * The one judgement made here is `suspectedFalsePositive`, and it is deliberately
 * a mechanical rule rather than an opinion: a customer who has already paid for
 * orders in this shop and is now being refused is worth a human look. The
 * application says "look at this"; it does not say "this is wrong".
 */

/** How far back to look, unless a caller asks for something else. */
export const DEFAULT_WINDOW_DAYS = 90;
/** Incidents handed to a reviewer, and to the model. Newest first. */
const INCIDENT_LIMIT = 25;

export interface FraudIncident {
  orderId: string;
  createdAt: string;
  total: number;
  /** Email when known, so an operator can recognise the customer. */
  customer: string | null;
  authenticated: boolean;
  /** Fraud rules that matched on the refused checkout. */
  matchedRules: string[];
  reason: string | null;
  /** Paid orders by the same customer inside the analysed window. */
  priorPaidOrders: number;
  /** Other refusals for the same customer inside the window. */
  priorBlockedOrders: number;
  /** Set when the same customer has already paid for something here. */
  suspectedFalsePositive: boolean;
}

export interface FraudStats {
  windowDays: number;
  /** Checkouts that produced an order row, refused or not. */
  checkouts: number;
  blocked: number;
  blockRate: number;
  /** Value of the refused baskets. Money the shop declined to take. */
  blockedValue: number;
  paid: number;
  byRule: { key: string; blocked: number; blockedValue: number }[];
  guestBlocked: number;
  authenticatedBlocked: number;
  suspectedFalsePositives: number;
  /** Customers refused more than once in the window. */
  repeatBlockedCustomers: number;
  /** Recorded fraud evaluations, which include checkouts never completed. */
  fraudEvaluations: number;
  /** Distribution of the risk scores the rules assigned. */
  scoreBuckets: { label: string; count: number }[];
  incidents: FraudIncident[];
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Reads the fraud rules recorded on an order's decision trace. */
function fraudRulesOf(trace: unknown): string[] {
  if (!trace || typeof trace !== "object") return [];
  const fraud = (trace as { fraud?: unknown }).fraud;
  if (!fraud || typeof fraud !== "object") return [];
  const matched = (fraud as { matchedRules?: unknown }).matchedRules;
  return Array.isArray(matched)
    ? matched.filter((key): key is string => typeof key === "string")
    : [];
}

/** Identity used to group a customer's attempts: account first, then email. */
function identityOf(order: {
  userId: string | null;
  guestEmail: string | null;
}): string | null {
  return order.userId ?? order.guestEmail ?? null;
}

const SCORE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0-24", min: 0, max: 25 },
  { label: "25-49", min: 25, max: 50 },
  { label: "50-74", min: 50, max: 75 },
  { label: "75-100", min: 75, max: 101 },
];

export async function computeFraudStats(
  storeId: string,
  options: { windowDays?: number } = {},
): Promise<FraudStats> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [orders, evaluations] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        total: true,
        userId: true,
        guestEmail: true,
        createdAt: true,
        decisionTrace: true,
        user: { select: { email: true } },
      },
    }),
    prisma.evaluation.findMany({
      where: { storeId, decisionType: "fraud", createdAt: { gte: since } },
      select: { decision: true },
    }),
  ]);

  const blockedOrders = orders.filter((order) => order.status === "BLOCKED");
  const paidOrders = orders.filter((order) => order.status === "PAID");

  // Reasons live in the audit trail rather than on the order, because the refusal
  // is an event: the order row records that it happened, the audit entry records
  // why. Fetched in one query for the incidents being reported.
  const reported = blockedOrders.slice(0, INCIDENT_LIMIT);
  const auditRows = reported.length
    ? await prisma.auditLog.findMany({
        where: {
          storeId,
          action: "order.blocked",
          entityId: { in: reported.map((order) => order.id) },
        },
        select: { entityId: true, meta: true },
      })
    : [];

  const reasonByOrder = new Map<string, string>();
  for (const row of auditRows) {
    const meta = row.meta as { reason?: unknown } | null;
    if (row.entityId && typeof meta?.reason === "string") {
      reasonByOrder.set(row.entityId, meta.reason);
    }
  }

  // Per-customer history inside the window, so a refusal can be read against
  // what that customer has done here before.
  const paidByIdentity = new Map<string, number>();
  const blockedByIdentity = new Map<string, number>();
  for (const order of orders) {
    const identity = identityOf(order);
    if (!identity) continue;
    if (order.status === "PAID") {
      paidByIdentity.set(identity, (paidByIdentity.get(identity) ?? 0) + 1);
    }
    if (order.status === "BLOCKED") {
      blockedByIdentity.set(
        identity,
        (blockedByIdentity.get(identity) ?? 0) + 1,
      );
    }
  }

  const byRule = new Map<string, { blocked: number; blockedValue: number }>();
  let blockedValue = 0;
  let guestBlocked = 0;

  for (const order of blockedOrders) {
    const total = Number(order.total);
    blockedValue += total;
    if (!order.userId) guestBlocked += 1;

    for (const key of fraudRulesOf(order.decisionTrace)) {
      const entry = byRule.get(key) ?? { blocked: 0, blockedValue: 0 };
      entry.blocked += 1;
      entry.blockedValue += total;
      byRule.set(key, entry);
    }
  }

  const incidents: FraudIncident[] = reported.map((order) => {
    const identity = identityOf(order);
    const priorPaidOrders = identity ? (paidByIdentity.get(identity) ?? 0) : 0;
    const priorBlocked = identity
      ? Math.max(0, (blockedByIdentity.get(identity) ?? 0) - 1)
      : 0;

    return {
      orderId: order.id,
      createdAt: order.createdAt.toISOString(),
      total: round(Number(order.total)),
      customer: order.user?.email ?? order.guestEmail ?? null,
      authenticated: Boolean(order.userId),
      matchedRules: fraudRulesOf(order.decisionTrace),
      reason: reasonByOrder.get(order.id) ?? null,
      priorPaidOrders,
      priorBlockedOrders: priorBlocked,
      suspectedFalsePositive: priorPaidOrders > 0,
    };
  });

  const scoreCounts = SCORE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
  }));

  for (const evaluation of evaluations) {
    const decision = (evaluation.decision ?? {}) as {
      fraud?: { score?: unknown };
    };
    const score = decision.fraud?.score;
    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    const index = SCORE_BUCKETS.findIndex(
      (bucket) => score >= bucket.min && score < bucket.max,
    );
    const bucket = index >= 0 ? scoreCounts[index] : undefined;
    if (bucket) bucket.count += 1;
  }

  const repeatBlockedCustomers = [...blockedByIdentity.values()].filter(
    (count) => count > 1,
  ).length;

  return {
    windowDays,
    checkouts: orders.length,
    blocked: blockedOrders.length,
    blockRate: orders.length
      ? Math.round((blockedOrders.length / orders.length) * 10000) / 10000
      : 0,
    blockedValue: round(blockedValue),
    paid: paidOrders.length,
    byRule: [...byRule.entries()]
      .map(([key, entry]) => ({
        key,
        blocked: entry.blocked,
        blockedValue: round(entry.blockedValue),
      }))
      .sort((a, b) => b.blocked - a.blocked),
    guestBlocked,
    authenticatedBlocked: blockedOrders.length - guestBlocked,
    suspectedFalsePositives: incidents.filter(
      (incident) => incident.suspectedFalsePositive,
    ).length,
    repeatBlockedCustomers,
    fraudEvaluations: evaluations.length,
    scoreBuckets: scoreCounts,
    incidents,
  };
}
