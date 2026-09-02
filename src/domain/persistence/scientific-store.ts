import { PlantGrowthFactor, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  analyzeFactorialGrowth,
  compareReplicationAnalyses,
  type FactorialGrowthAnalysis,
} from "@/domain/analysis";
import { AnalysisDomainError } from "@/domain/analysis/errors";
import type { FactorUnits } from "@/domain/experiment/types";
import type { PublicSyntheticObservation } from "@/domain/simulation/types";

import { recordExperimentEvent } from "./event-store";

export type CreateFindingInput = {
  experimentId: string;
  analysisId: string;
  findingText: string;
  confidence: number;
  replicationId?: string;
};

export type PersistReplicationInput = {
  originalExperimentId: string;
  replicationExperimentId: string;
};

function asFactorUnits(value: Prisma.JsonValue): FactorUnits {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as FactorUnits;
}

function mapObservationForAnalysis(
  observation: {
    factorValues: Prisma.JsonValue;
    biomass: number;
    growthRate: number;
    dataLabel: string;
    simulationVersion: string;
    replicateIndex: number;
    combinationIndex: number;
  },
  units: FactorUnits,
): PublicSyntheticObservation {
  return {
    dataLabel: observation.dataLabel as "synthetic",
    simulationVersion: observation.simulationVersion,
    replicateIndex: observation.replicateIndex,
    combinationIndex: observation.combinationIndex,
    factorValues: observation.factorValues as Partial<
      Record<PlantGrowthFactor, number>
    >,
    units,
    biomass: observation.biomass,
    growthRate: observation.growthRate,
  };
}

export async function loadExperimentObservations(
  experimentId: string,
): Promise<PublicSyntheticObservation[]> {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    select: { units: true },
  });

  if (!experiment) {
    throw new AnalysisDomainError(
      `Experiment not found: ${experimentId}`,
      "NOT_FOUND",
    );
  }

  const units = asFactorUnits(experiment.units);
  const observations = await db.simulationObservation.findMany({
    where: { experimentId },
    orderBy: [{ replicateIndex: "asc" }, { combinationIndex: "asc" }],
  });

  return observations.map((observation) =>
    mapObservationForAnalysis(observation, units),
  );
}

export async function retrieveExperimentResults(
  experimentId: string,
): Promise<PublicSyntheticObservation[]> {
  const observations = await loadExperimentObservations(experimentId);

  await recordExperimentEvent({
    experimentId,
    type: "results_retrieved",
    metadata: {
      observationCount: observations.length,
      simulationVersion: observations[0]?.simulationVersion ?? null,
    },
  });

  return observations;
}

export async function persistAnalysisForExperiment(experimentId: string) {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment) {
    throw new AnalysisDomainError(
      `Experiment not found: ${experimentId}`,
      "NOT_FOUND",
    );
  }

  const observations = await loadExperimentObservations(experimentId);

  if (observations.length === 0) {
    throw new AnalysisDomainError(
      `No observations found for experiment: ${experimentId}`,
      "MISSING_OBSERVATIONS",
    );
  }

  const result: FactorialGrowthAnalysis =
    analyzeFactorialGrowth(observations);

  const analysis = await db.analysis.create({
    data: {
      experimentId: experiment.id,
      analysisVersion: result.analysis_version,
      model: result.model,
      effects: result.effects,
      sampleSize: result.sample_size,
      residualDegreesOfFreedom: result.residual_degrees_of_freedom,
      residualStandardError: result.residual_standard_error,
      responseVariable: result.response_variable,
      simulationVersion: experiment.simulationVersion,
      seed: experiment.seed,
    },
  });

  return { analysis, result };
}

export async function createFinding(input: CreateFindingInput) {
  if (!input.findingText.trim()) {
    throw new AnalysisDomainError(
      "Finding text is required",
      "INVALID_FINDING",
    );
  }

  if (input.confidence < 0 || input.confidence > 1) {
    throw new AnalysisDomainError(
      "Finding confidence must be between 0 and 1",
      "INVALID_CONFIDENCE",
    );
  }

  const analysis = await db.analysis.findUnique({
    where: { id: input.analysisId },
  });

  if (!analysis) {
    throw new AnalysisDomainError(
      `Analysis not found: ${input.analysisId}`,
      "ANALYSIS_NOT_FOUND",
    );
  }

  if (analysis.experimentId !== input.experimentId) {
    throw new AnalysisDomainError(
      "Finding experiment_id must match the analysis experiment_id",
      "PROVENANCE_MISMATCH",
    );
  }

  if (input.replicationId) {
    const replication = await db.replication.findUnique({
      where: { id: input.replicationId },
    });

    if (!replication) {
      throw new AnalysisDomainError(
        `Replication not found: ${input.replicationId}`,
        "REPLICATION_NOT_FOUND",
      );
    }

    if (
      replication.originalExperimentId !== input.experimentId &&
      replication.replicationExperimentId !== input.experimentId
    ) {
      throw new AnalysisDomainError(
        "Finding experiment must belong to the linked replication",
        "PROVENANCE_MISMATCH",
      );
    }
  }

  const finding = await db.finding.create({
    data: {
      experimentId: input.experimentId,
      analysisId: input.analysisId,
      findingText: input.findingText.trim(),
      confidence: input.confidence,
      replicationId: input.replicationId,
    },
  });

  await recordExperimentEvent({
    experimentId: finding.experimentId,
    type: "finding_saved",
    metadata: {
      findingId: finding.id,
      analysisId: finding.analysisId,
      confidence: finding.confidence,
      replicationId: finding.replicationId,
    },
  });

  return finding;
}

function maxRelativeEffectDifference(
  comparisons: ReturnType<typeof compareReplicationAnalyses>["comparisons"],
): number {
  return Math.max(
    comparisons.temperature.criteria.relative_effect_difference,
    comparisons.water.criteria.relative_effect_difference,
    comparisons.temperature_water_interaction.criteria
      .relative_effect_difference,
  );
}

export async function persistReplication(input: PersistReplicationInput) {
  const [original, replication] = await Promise.all([
    db.experiment.findUnique({ where: { id: input.originalExperimentId } }),
    db.experiment.findUnique({
      where: { id: input.replicationExperimentId },
    }),
  ]);

  if (!original) {
    throw new AnalysisDomainError(
      `Original experiment not found: ${input.originalExperimentId}`,
      "NOT_FOUND",
    );
  }

  if (!replication) {
    throw new AnalysisDomainError(
      `Replication experiment not found: ${input.replicationExperimentId}`,
      "NOT_FOUND",
    );
  }

  if (original.seed === replication.seed) {
    throw new AnalysisDomainError(
      "Replication experiment must use a different seed than the original",
      "IDENTICAL_SEED",
    );
  }

  const originalObservations = await loadExperimentObservations(original.id);
  const replicationObservations = await loadExperimentObservations(
    replication.id,
  );

  if (
    originalObservations.length === 0 ||
    replicationObservations.length === 0
  ) {
    throw new AnalysisDomainError(
      "Both original and replication experiments must have observations",
      "MISSING_OBSERVATIONS",
    );
  }

  const originalAnalysis = analyzeFactorialGrowth(originalObservations);
  const replicationAnalysis = analyzeFactorialGrowth(replicationObservations);
  const comparison = compareReplicationAnalyses({
    original: originalAnalysis,
    replication: replicationAnalysis,
  });

  const record = await db.replication.create({
    data: {
      originalExperimentId: original.id,
      replicationExperimentId: replication.id,
      originalSeed: original.seed,
      replicationSeed: replication.seed,
      originalEffect: originalAnalysis.effects,
      replicationEffect: replicationAnalysis.effects,
      originalConfidenceInterval: {
        temperature: originalAnalysis.effects.temperature.confidence_interval,
        water: originalAnalysis.effects.water.confidence_interval,
        temperature_water_interaction:
          originalAnalysis.effects.temperature_water_interaction
            .confidence_interval,
      },
      replicationConfidenceInterval: {
        temperature:
          replicationAnalysis.effects.temperature.confidence_interval,
        water: replicationAnalysis.effects.water.confidence_interval,
        temperature_water_interaction:
          replicationAnalysis.effects.temperature_water_interaction
            .confidence_interval,
      },
      sameDirection: comparison.replication_rule.same_direction,
      confidenceIntervalOverlap:
        comparison.replication_rule.confidence_intervals_overlap,
      relativeEffectDifference: maxRelativeEffectDifference(
        comparison.comparisons,
      ),
      replicationSuccess: comparison.replicated,
      analysisVersion: originalAnalysis.analysis_version,
      simulationVersion: original.simulationVersion,
    },
  });

  await recordExperimentEvent({
    experimentId: original.id,
    type: "replication_completed",
    metadata: {
      replicationId: record.id,
      replicationExperimentId: replication.id,
      originalSeed: record.originalSeed,
      replicationSeed: record.replicationSeed,
      replicationSuccess: record.replicationSuccess,
      sameDirection: record.sameDirection,
      confidenceIntervalOverlap: record.confidenceIntervalOverlap,
      relativeEffectDifference: record.relativeEffectDifference,
      analysisVersion: record.analysisVersion,
      simulationVersion: record.simulationVersion,
    },
  });

  return record;
}

export async function traceFindingProvenance(findingId: string) {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      analysis: true,
      experiment: {
        include: {
          observations: {
            orderBy: [{ replicateIndex: "asc" }, { combinationIndex: "asc" }],
          },
        },
      },
      replication: {
        include: {
          originalExperiment: {
            include: {
              observations: {
                orderBy: [
                  { replicateIndex: "asc" },
                  { combinationIndex: "asc" },
                ],
              },
            },
          },
          replicationExperiment: {
            include: {
              observations: {
                orderBy: [
                  { replicateIndex: "asc" },
                  { combinationIndex: "asc" },
                ],
              },
            },
          },
        },
      },
    },
  });

  if (!finding) {
    throw new AnalysisDomainError(
      `Finding not found: ${findingId}`,
      "FINDING_NOT_FOUND",
    );
  }

  return finding;
}
