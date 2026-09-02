import type { PublicSyntheticObservation, SyntheticObservation } from "@/domain/simulation/types";

export const ANALYSIS_VERSION = "1.0" as const;

export const FACTORIAL_GROWTH_MODEL =
  "growth ~ temperature + water + temperature:water" as const;

export const REPLICATION_RELATIVE_EFFECT_THRESHOLD = 0.2;

export type AnalysisObservation =
  | SyntheticObservation
  | PublicSyntheticObservation;

export type EffectDirection = "positive" | "negative" | "neutral";

export type EffectEstimate = {
  estimate: number;
  standard_error: number;
  confidence_interval: {
    lower: number;
    upper: number;
    level: number;
  };
  t_statistic: number;
  p_value: number;
  direction: EffectDirection;
};

export type FactorialGrowthAnalysis = {
  effects: {
    temperature: EffectEstimate;
    water: EffectEstimate;
    temperature_water_interaction: EffectEstimate;
  };
  model: typeof FACTORIAL_GROWTH_MODEL;
  analysis_version: typeof ANALYSIS_VERSION;
  response_variable: "biomass";
  sample_size: number;
  residual_degrees_of_freedom: number;
  residual_standard_error: number;
};

export type EffectComparisonCriterion = {
  same_direction: boolean;
  confidence_intervals_overlap: boolean;
  relative_effect_difference_below_threshold: boolean;
  relative_effect_difference: number;
};

export type EffectComparison = {
  original: EffectEstimate;
  replication: EffectEstimate;
  criteria: EffectComparisonCriterion;
  passes: boolean;
};

export type ReplicationAnalysis = {
  original: FactorialGrowthAnalysis;
  replication: FactorialGrowthAnalysis;
  comparisons: {
    temperature: EffectComparison;
    water: EffectComparison;
    temperature_water_interaction: EffectComparison;
  };
  replicated: boolean;
  replication_rule: {
    same_direction: boolean;
    confidence_intervals_overlap: boolean;
    relative_effect_difference_below_threshold: boolean;
    relative_effect_difference_threshold: number;
  };
};

export type GrowthRegressionRow = {
  temperature: number;
  water: number;
  growth: number;
};
