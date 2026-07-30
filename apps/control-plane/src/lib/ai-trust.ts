import type { SimulationResult } from "@ruleshop/engine";

/**
 * How much the platform is willing to vouch for a suggestion.
 *
 * A language model will happily report 0.95 confidence in a rule it invented for
 * a field that does not exist. That number is a claim about itself, not evidence
 * about the proposal, so it is never what this application stores as confidence.
 *
 * The score here is assembled from things the platform checked or measured: that
 * the rule validated against the store's own schema, how much recorded traffic
 * was available to test it on, whether it changed anything on that traffic, and
 * whether the change is broad enough not to be an accident. The model's claim is
 * carried alongside, labelled as a claim, and flagged when it runs well ahead of
 * the evidence.
 */

export type TrustLevel = "low" | "medium" | "high";

export interface TrustSignal {
  /** Stable id so the UI can order and style signals consistently. */
  id:
    | "schema-valid"
    | "sample"
    | "measurable"
    | "broad"
    | "no-block-regression";
  label: string;
  /** Share of the total score this signal can contribute. */
  weight: number;
  /** How much of that share it earned, 0 to 1. */
  earned: number;
  detail: string;
}

export interface TrustAssessment {
  /** 0 to 1, computed here. This is what gets stored as confidence. */
  score: number;
  level: TrustLevel;
  signals: TrustSignal[];
  /** What the model said about itself, kept separate from the score. */
  modelClaim: number | null;
  /**
   * True when the model's claim runs more than 0.3 ahead of the evidence — worth
   * showing a reviewer, because it is the shape of a confident wrong answer.
   */
  claimOverstated: boolean;
}

/** Enough changed decisions that the effect is not a single lucky context. */
const BROAD_ABSOLUTE = 10;
const BROAD_SHARE = 0.05;

/** Scores below this read as low; below the next one, medium. */
const LOW_CEILING = 0.4;
const MEDIUM_CEILING = 0.7;

function level(score: number): TrustLevel {
  if (score < LOW_CEILING) return "low";
  if (score < MEDIUM_CEILING) return "medium";
  return "high";
}

/**
 * Ceiling applied when a simulation ran and found no effect.
 *
 * Such a proposal collects credit for validating cleanly and for having plenty of
 * history to test on, which would add up to a middling score — and "medium
 * confidence" next to a change that provably does nothing invites a pointless
 * approval. Not making things worse is not evidence of an improvement, so the
 * score is held inside the "low" band.
 */
const NO_EFFECT_CEILING = LOW_CEILING - 0.05;

function assemble(
  signals: TrustSignal[],
  modelClaim: number | null,
  options: { capAtNoEffect?: boolean } = {},
): TrustAssessment {
  const score = signals.reduce(
    (total, signal) => total + signal.weight * signal.earned,
    0,
  );
  const capped = options.capAtNoEffect
    ? Math.min(score, NO_EFFECT_CEILING)
    : score;
  const rounded = Math.round(capped * 100) / 100;

  return {
    score: rounded,
    level: level(rounded),
    signals,
    modelClaim,
    claimOverstated: modelClaim !== null && modelClaim - rounded > 0.3,
  };
}

/**
 * Assesses a proposed or revised rule.
 *
 * Called after validation, so the schema signal is normally earned — it is still
 * listed rather than assumed, because a reviewer should see which checks stand
 * behind a number instead of a bare percentage.
 */
export function assessRuleProposal(input: {
  schemaValid: boolean;
  simulation: SimulationResult | null;
  modelClaim: number | null;
}): TrustAssessment {
  const { simulation } = input;

  const changedDecisions = simulation
    ? simulation.ruleHitChanges.reduce(
        (total, row) => total + Math.abs(row.after - row.before),
        0,
      )
    : 0;
  const measurable = simulation
    ? simulation.deltas.some((delta) => delta.delta !== 0) ||
      changedDecisions > 0
    : false;
  const sampleSize = simulation?.current.sampleSize ?? 0;
  const broad =
    changedDecisions >= BROAD_ABSOLUTE ||
    (sampleSize > 0 && changedDecisions / sampleSize >= BROAD_SHARE);

  const blockedDelta = simulation
    ? simulation.candidate.blockedCount - simulation.current.blockedCount
    : 0;

  const signals: TrustSignal[] = [
    {
      id: "schema-valid",
      label: "Validată pe schema magazinului",
      weight: 0.25,
      earned: input.schemaValid ? 1 : 0,
      detail: input.schemaValid
        ? "Câmpurile, operatorii și tipurile există și sunt compatibile."
        : "Propunerea nu a trecut validarea structurală.",
    },
    {
      id: "sample",
      label: "Volum de istoric",
      weight: 0.25,
      earned:
        simulation === null
          ? 0
          : simulation.sampleAdequacy === "reasonable"
            ? 1
            : simulation.sampleAdequacy === "indicative"
              ? 0.5
              : 0,
      detail:
        simulation === null
          ? "Propunerea nu a fost încă simulată pe istoric."
          : `${sampleSize} evaluări reluate (${simulation.sampleAdequacy}).`,
    },
    {
      id: "measurable",
      label: "Efect măsurabil",
      weight: 0.2,
      earned: measurable ? 1 : 0,
      detail: measurable
        ? "Simularea arată o diferență față de versiunea publicată."
        : "Simularea nu arată nicio diferență — nu se poate afirma că este o îmbunătățire.",
    },
    {
      id: "broad",
      label: "Efect suficient de larg",
      weight: 0.15,
      earned: broad ? 1 : 0,
      detail: broad
        ? `${changedDecisions} potriviri modificate pe eșantion.`
        : `Doar ${changedDecisions} potriviri modificate — prea puțin pentru o concluzie.`,
    },
    {
      id: "no-block-regression",
      label: "Nu blochează mai mulți clienți",
      weight: 0.15,
      // Unsimulated earns nothing: "does not block more customers" is a claim
      // about a replay that never happened, and crediting it would let a
      // proposal score for the absence of evidence.
      earned: simulation === null ? 0 : blockedDelta > 0 ? 0 : 1,
      detail:
        simulation === null
          ? "Nu s-a putut verifica: propunerea nu a fost simulată."
          : blockedDelta > 0
            ? `Ar bloca ${blockedDelta} comenzi în plus pe același istoric.`
            : "Nu crește numărul de comenzi blocate.",
    },
  ];

  return assemble(signals, input.modelClaim, {
    capAtNoEffect: simulation !== null && !measurable,
  });
}

/** Sample size at which a ruleset analysis is treated as fully evidenced. */
const CONFIDENT_SAMPLE = 200;

/**
 * Assesses an analysis.
 *
 * There is nothing to simulate here — the findings are already facts about the
 * ruleset — so the only real question is how much recorded traffic the usage
 * findings rest on.
 */
export function assessAnalysis(input: {
  sampleSize: number;
  replaySampleSize: number;
}): TrustAssessment {
  const signals: TrustSignal[] = [
    {
      id: "schema-valid",
      label: "Constatări structurale verificate",
      weight: 0.4,
      earned: 1,
      detail:
        "Duplicate, umbriri, contradicții și condiții imposibile sunt derivate din reguli, nu estimate.",
    },
    {
      id: "sample",
      label: "Volum de istoric",
      weight: 0.35,
      earned: Math.min(1, input.sampleSize / CONFIDENT_SAMPLE),
      detail: `${input.sampleSize} evaluări analizate pentru utilizare.`,
    },
    {
      id: "measurable",
      label: "Impact per regulă măsurat",
      weight: 0.25,
      earned: input.replaySampleSize > 0 ? 1 : 0,
      detail:
        input.replaySampleSize > 0
          ? `${input.replaySampleSize} contexte reluate cu fiecare regulă scoasă pe rând.`
          : "Nu existau contexte salvate pentru reluare.",
    },
  ];

  return assemble(signals, null);
}
