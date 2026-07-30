import { describe, expect, it } from "vitest";
import type { SimulationResult } from "@ruleshop/engine";
import { assessAnalysis, assessRuleProposal } from "./ai-trust";

/**
 * The point of this scoring is that a model cannot talk its way up it. These
 * tests exist to keep it that way: the same proposal must score the same whether
 * the model claimed 0.1 or 0.99, and a proposal that changes nothing must not be
 * presentable as a confident improvement.
 */

function simulation(overrides: {
  sampleSize?: number;
  sampleAdequacy?: SimulationResult["sampleAdequacy"];
  ruleHitChanges?: SimulationResult["ruleHitChanges"];
  blockedBefore?: number;
  blockedAfter?: number;
  revenueDelta?: number;
} = {}): SimulationResult {
  const sampleSize = overrides.sampleSize ?? 300;
  const blockedBefore = overrides.blockedBefore ?? 0;
  const blockedAfter = overrides.blockedAfter ?? 0;
  const revenueDelta = overrides.revenueDelta ?? -100;

  const metrics = (blocked: number, revenue: number) => ({
    sampleSize,
    matchedCount: 0,
    matchRate: 0,
    avgDiscountPercent: 0,
    discountedCount: 0,
    grossRevenue: revenue,
    discountCost: 0,
    blockedCount: blocked,
    blockRate: 0,
    pointsGranted: 0,
    ruleHits: {},
  });

  return {
    current: metrics(blockedBefore, 1000),
    candidate: metrics(blockedAfter, 1000 + revenueDelta),
    deltas: [
      {
        label: "Venit estimat (per unitate)",
        before: 1000,
        after: 1000 + revenueDelta,
        delta: revenueDelta,
        percentChange: null,
        format: "money",
        higherIsBetter: true,
      },
    ],
    ruleHitChanges:
      overrides.ruleHitChanges ?? [{ key: "vip", before: 10, after: 40 }],
    sampleAdequacy: overrides.sampleAdequacy ?? "reasonable",
  };
}

describe("assessRuleProposal", () => {
  it("scores a well-evidenced proposal highly", () => {
    const trust = assessRuleProposal({
      schemaValid: true,
      simulation: simulation(),
      modelClaim: 0.8,
    });

    expect(trust.score).toBe(1);
    expect(trust.level).toBe("high");
    expect(trust.claimOverstated).toBe(false);
  });

  it("ignores the model's claim entirely when scoring", () => {
    const shared = { schemaValid: true, simulation: simulation() };

    const modest = assessRuleProposal({ ...shared, modelClaim: 0.1 });
    const boastful = assessRuleProposal({ ...shared, modelClaim: 0.99 });

    expect(modest.score).toBe(boastful.score);
    expect(modest.modelClaim).toBe(0.1);
    expect(boastful.modelClaim).toBe(0.99);
  });

  it("flags a claim that runs ahead of the evidence", () => {
    const trust = assessRuleProposal({
      schemaValid: true,
      // Nothing simulated: no sample, no measured effect.
      simulation: null,
      modelClaim: 0.95,
    });

    // Only the validation signal is earned.
    expect(trust.score).toBe(0.25);
    expect(trust.level).toBe("low");
    expect(trust.claimOverstated).toBe(true);
  });

  it("refuses credit for an effect it cannot measure", () => {
    const trust = assessRuleProposal({
      schemaValid: true,
      simulation: simulation({
        ruleHitChanges: [],
        revenueDelta: 0,
      }),
      modelClaim: null,
    });

    const measurable = trust.signals.find((s) => s.id === "measurable");
    expect(measurable?.earned).toBe(0);
    expect(trust.signals.find((s) => s.id === "broad")?.earned).toBe(0);
    // Validation, sample volume and the absence of new blocks would otherwise add
    // up to a middling score; a change that provably does nothing is held down.
    expect(trust.score).toBe(0.35);
    expect(trust.level).toBe("low");
  });

  it("gives half credit for an indicative sample", () => {
    const trust = assessRuleProposal({
      schemaValid: true,
      simulation: simulation({ sampleSize: 40, sampleAdequacy: "indicative" }),
      modelClaim: null,
    });

    expect(trust.signals.find((s) => s.id === "sample")?.earned).toBe(0.5);
  });

  it("withholds credit when the candidate would block more customers", () => {
    const trust = assessRuleProposal({
      schemaValid: true,
      simulation: simulation({ blockedBefore: 2, blockedAfter: 9 }),
      modelClaim: null,
    });

    const signal = trust.signals.find((s) => s.id === "no-block-regression");
    expect(signal?.earned).toBe(0);
    expect(signal?.detail).toContain("7");
  });

  it("treats a small share of changed decisions as too narrow to conclude", () => {
    const trust = assessRuleProposal({
      schemaValid: true,
      simulation: simulation({
        sampleSize: 400,
        ruleHitChanges: [{ key: "vip", before: 0, after: 3 }],
      }),
      modelClaim: null,
    });

    expect(trust.signals.find((s) => s.id === "measurable")?.earned).toBe(1);
    expect(trust.signals.find((s) => s.id === "broad")?.earned).toBe(0);
  });
});

describe("assessAnalysis", () => {
  it("scales with the recorded sample and rewards a replay", () => {
    const thin = assessAnalysis({ sampleSize: 20, replaySampleSize: 0 });
    const full = assessAnalysis({ sampleSize: 400, replaySampleSize: 300 });

    expect(thin.score).toBeLessThan(full.score);
    expect(full.score).toBe(1);
    // Structural findings hold even with no history at all.
    expect(assessAnalysis({ sampleSize: 0, replaySampleSize: 0 }).score).toBe(0.4);
  });

  it("never carries a model claim, because no model is involved", () => {
    const trust = assessAnalysis({ sampleSize: 100, replaySampleSize: 100 });
    expect(trust.modelClaim).toBeNull();
    expect(trust.claimOverstated).toBe(false);
  });
});
