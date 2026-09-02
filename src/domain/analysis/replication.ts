import {
  REPLICATION_RELATIVE_EFFECT_THRESHOLD,
  type EffectComparison,
  type EffectEstimate,
  type FactorialGrowthAnalysis,
  type ReplicationAnalysis,
} from "./types";

const EFFECT_KEYS = [
  "temperature",
  "water",
  "temperature_water_interaction",
] as const;

type EffectKey = (typeof EFFECT_KEYS)[number];

function confidenceIntervalsOverlap(
  left: EffectEstimate,
  right: EffectEstimate,
): boolean {
  return (
    Math.max(left.confidence_interval.lower, right.confidence_interval.lower) <=
    Math.min(left.confidence_interval.upper, right.confidence_interval.upper)
  );
}

function sameDirection(
  left: EffectEstimate,
  right: EffectEstimate,
): boolean {
  return left.direction === right.direction;
}

function relativeEffectDifference(
  left: EffectEstimate,
  right: EffectEstimate,
): number {
  const denominator = Math.max(
    Math.abs(left.estimate),
    Math.abs(right.estimate),
    1e-9,
  );

  return Math.abs(left.estimate - right.estimate) / denominator;
}

function compareEffect(
  original: EffectEstimate,
  replication: EffectEstimate,
): EffectComparison {
  const sameDirectionResult = sameDirection(original, replication);
  const overlap = confidenceIntervalsOverlap(original, replication);
  const relativeDifference = relativeEffectDifference(original, replication);
  const belowThreshold =
    relativeDifference < REPLICATION_RELATIVE_EFFECT_THRESHOLD;

  return {
    original,
    replication,
    criteria: {
      same_direction: sameDirectionResult,
      confidence_intervals_overlap: overlap,
      relative_effect_difference_below_threshold: belowThreshold,
      relative_effect_difference: Number(relativeDifference.toFixed(8)),
    },
    passes: sameDirectionResult && overlap && belowThreshold,
  };
}

export function compareReplicationAnalyses(input: {
  original: FactorialGrowthAnalysis;
  replication: FactorialGrowthAnalysis;
}): ReplicationAnalysis {
  const comparisons = Object.fromEntries(
    EFFECT_KEYS.map((key) => [
      key,
      compareEffect(input.original.effects[key], input.replication.effects[key]),
    ]),
  ) as Record<EffectKey, EffectComparison>;

  const sameDirectionRule = EFFECT_KEYS.every(
    (key) => comparisons[key].criteria.same_direction,
  );
  const overlapRule = EFFECT_KEYS.every(
    (key) => comparisons[key].criteria.confidence_intervals_overlap,
  );
  const relativeDifferenceRule = EFFECT_KEYS.every(
    (key) =>
      comparisons[key].criteria.relative_effect_difference_below_threshold,
  );

  return {
    original: input.original,
    replication: input.replication,
    comparisons: {
      temperature: comparisons.temperature,
      water: comparisons.water,
      temperature_water_interaction: comparisons.temperature_water_interaction,
    },
    replicated:
      sameDirectionRule && overlapRule && relativeDifferenceRule,
    replication_rule: {
      same_direction: sameDirectionRule,
      confidence_intervals_overlap: overlapRule,
      relative_effect_difference_below_threshold: relativeDifferenceRule,
      relative_effect_difference_threshold:
        REPLICATION_RELATIVE_EFFECT_THRESHOLD,
    },
  };
}
