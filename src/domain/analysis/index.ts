import { simulateExperiment } from "@/domain/simulation/simulator";
import type { ExperimentDesign } from "@/domain/simulation/types";

import { analyzeFactorialGrowth } from "./analyzer";
import { compareReplicationAnalyses } from "./replication";
import type { AnalysisObservation, ReplicationAnalysis } from "./types";

export function analyzeObservations(
  observations: AnalysisObservation[],
) {
  return analyzeFactorialGrowth(observations);
}

export function analyzeReplicationFromObservations(input: {
  originalObservations: AnalysisObservation[];
  replicationObservations: AnalysisObservation[];
}): ReplicationAnalysis {
  const original = analyzeFactorialGrowth(input.originalObservations);
  const replication = analyzeFactorialGrowth(input.replicationObservations);

  return compareReplicationAnalyses({ original, replication });
}

export function analyzeReplicationFromDesign(input: {
  design: ExperimentDesign;
  replicationSeed: number;
}): ReplicationAnalysis {
  const originalResult = simulateExperiment(input.design);
  const replicationResult = simulateExperiment({
    ...input.design,
    seed: input.replicationSeed,
  });

  return analyzeReplicationFromObservations({
    originalObservations: originalResult.observations,
    replicationObservations: replicationResult.observations,
  });
}

export {
  analyzeFactorialGrowth,
  compareReplicationAnalyses,
};

export type {
  AnalysisObservation,
  EffectComparison,
  EffectEstimate,
  FactorialGrowthAnalysis,
  ReplicationAnalysis,
} from "./types";

export {
  ANALYSIS_VERSION,
  FACTORIAL_GROWTH_MODEL,
  REPLICATION_RELATIVE_EFFECT_THRESHOLD,
} from "./types";

export { AnalysisDomainError } from "./errors";
