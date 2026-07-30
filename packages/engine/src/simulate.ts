import { evaluate } from "./evaluate";
import type { DecisionType, RuleDefinition } from "./types";

/**
 * Replays recorded evaluations against a candidate ruleset.
 *
 * This is how a proposed change is judged before anyone publishes it: take the
 * contexts that really occurred, run both the live rules and the candidate over
 * them, and report the difference. The numbers come from this replay, never from
 * the language model — a model's estimate of revenue impact is a guess dressed as
 * a figure.
 *
 * What it cannot tell you: customers might behave differently under different
 * prices. This measures the mechanical effect of the rules on traffic that
 * already happened, which is a real answer to a narrower question.
 */

export interface HistoricalEvaluation {
  decisionType: DecisionType;
  context: Record<string, unknown>;
}

export interface RulesetMetrics {
  sampleSize: number;
  /** Evaluations where at least one rule matched. */
  matchedCount: number;
  matchRate: number;

  /** Pricing only: mean discount across evaluations that produced one. */
  avgDiscountPercent: number;
  discountedCount: number;

  /**
   * Business figures, summed over pricing evaluations whose context carried a
   * base price. Per unit — quantities are not part of a pricing context.
   */
  grossRevenue: number;
  discountCost: number;

  /** Fraud only. */
  blockedCount: number;
  blockRate: number;

  /** Loyalty only. */
  pointsGranted: number;

  ruleHits: Record<string, number>;
}

function emptyMetrics(sampleSize: number): RulesetMetrics {
  return {
    sampleSize,
    matchedCount: 0,
    matchRate: 0,
    avgDiscountPercent: 0,
    discountedCount: 0,
    grossRevenue: 0,
    discountCost: 0,
    blockedCount: 0,
    blockRate: 0,
    pointsGranted: 0,
    ruleHits: {},
  };
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Reads the base price a pricing context carried, if any. */
function basePriceOf(context: Record<string, unknown>): number | null {
  const product = context.product;
  if (!product || typeof product !== "object") return null;
  const raw = (product as { basePrice?: unknown }).basePrice;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? raw
    : null;
}

export function computeMetrics(
  history: HistoricalEvaluation[],
  rules: RuleDefinition[],
): RulesetMetrics {
  const metrics = emptyMetrics(history.length);

  let discountTotal = 0;
  let fraudEvaluations = 0;

  for (const item of history) {
    const result = evaluate({
      decisionType: item.decisionType,
      context: item.context,
      rules,
    });

    if (result.matchedRules.length > 0) metrics.matchedCount += 1;
    for (const key of result.matchedRules) {
      metrics.ruleHits[key] = (metrics.ruleHits[key] ?? 0) + 1;
    }

    if (item.decisionType === "pricing") {
      const basePrice = basePriceOf(item.context);
      const fixed = result.decision.fixedPrice;
      const percentRaw = result.decision.discountPercent;

      const percent =
        typeof percentRaw === "number" && Number.isFinite(percentRaw)
          ? Math.min(100, Math.max(0, percentRaw))
          : 0;

      if (percent > 0 || typeof fixed === "number") {
        metrics.discountedCount += 1;
      }
      if (percent > 0) discountTotal += percent;

      if (basePrice !== null) {
        // A fixed price states the final figure; a percentage modifies the base.
        // Same precedence the storefront applies, so the simulation and the shop
        // cannot disagree.
        const finalPrice =
          typeof fixed === "number" && Number.isFinite(fixed) && fixed >= 0
            ? fixed
            : basePrice * (1 - percent / 100);

        metrics.grossRevenue += finalPrice;
        metrics.discountCost += Math.max(0, basePrice - finalPrice);
      }
    }

    if (item.decisionType === "fraud") {
      fraudEvaluations += 1;
      if (result.decision.blocked === true) metrics.blockedCount += 1;
    }

    if (item.decisionType === "loyalty") {
      const points = result.decision.loyaltyPoints;
      if (typeof points === "number" && Number.isFinite(points)) {
        metrics.pointsGranted += points;
      }
    }
  }

  metrics.matchRate = history.length
    ? round(metrics.matchedCount / history.length, 4)
    : 0;
  metrics.avgDiscountPercent =
    discountTotal > 0 && metrics.discountedCount > 0
      ? round(discountTotal / metrics.discountedCount)
      : 0;
  metrics.blockRate = fraudEvaluations
    ? round(metrics.blockedCount / fraudEvaluations, 4)
    : 0;
  metrics.grossRevenue = round(metrics.grossRevenue);
  metrics.discountCost = round(metrics.discountCost);

  return metrics;
}

export interface MetricDelta {
  label: string;
  before: number;
  after: number;
  delta: number;
  /** Relative change, omitted when the baseline is zero. */
  percentChange: number | null;
  format: "count" | "percent" | "money" | "rate";
  /**
   * Whether an increase is desirable. Used for presentation only — the platform
   * does not decide what a shop wants, it just avoids colouring a revenue drop
   * as an improvement.
   */
  higherIsBetter: boolean | null;
}

export interface SimulationResult {
  current: RulesetMetrics;
  candidate: RulesetMetrics;
  deltas: MetricDelta[];
  /** Rules whose hit count moved, largest change first. */
  ruleHitChanges: { key: string; before: number; after: number }[];
  /**
   * Whether the sample is large enough to say anything. Not a statistical
   * confidence interval — an honest flag that a handful of events proves little.
   */
  sampleAdequacy: "insufficient" | "indicative" | "reasonable";
}

const MINIMUM_INDICATIVE = 20;
const MINIMUM_REASONABLE = 200;

function delta(
  label: string,
  before: number,
  after: number,
  format: MetricDelta["format"],
  higherIsBetter: boolean | null,
): MetricDelta {
  return {
    label,
    before,
    after,
    delta: round(after - before),
    percentChange: before === 0 ? null : round(((after - before) / before) * 100),
    format,
    higherIsBetter,
  };
}

export function simulateChange(
  history: HistoricalEvaluation[],
  currentRules: RuleDefinition[],
  candidateRules: RuleDefinition[],
): SimulationResult {
  const current = computeMetrics(history, currentRules);
  const candidate = computeMetrics(history, candidateRules);

  const deltas: MetricDelta[] = [
    delta("Reguli care se potrivesc", current.matchedCount, candidate.matchedCount, "count", null),
    delta("Rată de potrivire", current.matchRate, candidate.matchRate, "rate", null),
    delta(
      "Venit estimat (per unitate)",
      current.grossRevenue,
      candidate.grossRevenue,
      "money",
      true,
    ),
    delta(
      "Cost al reducerilor",
      current.discountCost,
      candidate.discountCost,
      "money",
      false,
    ),
    delta(
      "Reducere medie",
      current.avgDiscountPercent,
      candidate.avgDiscountPercent,
      "percent",
      null,
    ),
    delta(
      "Comenzi blocate",
      current.blockedCount,
      candidate.blockedCount,
      "count",
      null,
    ),
    delta("Puncte acordate", current.pointsGranted, candidate.pointsGranted, "count", null),
  ];

  const keys = new Set([
    ...Object.keys(current.ruleHits),
    ...Object.keys(candidate.ruleHits),
  ]);

  const ruleHitChanges = [...keys]
    .map((key) => ({
      key,
      before: current.ruleHits[key] ?? 0,
      after: candidate.ruleHits[key] ?? 0,
    }))
    .filter((row) => row.before !== row.after)
    .sort(
      (a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before),
    );

  const sampleAdequacy =
    history.length >= MINIMUM_REASONABLE
      ? "reasonable"
      : history.length >= MINIMUM_INDICATIVE
        ? "indicative"
        : "insufficient";

  return { current, candidate, deltas, ruleHitChanges, sampleAdequacy };
}
