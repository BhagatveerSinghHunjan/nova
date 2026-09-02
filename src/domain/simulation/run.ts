import { PlantGrowthFactor } from "@prisma/client";

import { db } from "@/lib/db";
import type { FactorLevels, FactorUnits } from "@/domain/experiment/types";

import { SimulationDomainError } from "./errors";
import { simulateExperiment, toPublicSimulationResult } from "./simulator";
import type {
  ExperimentDesign,
  PublicSimulationResult,
  SimulationWorldKey,
} from "./types";

export type RunSimulationInput = {
  experimentId: string;
};

function parseFactorLevels(value: unknown): FactorLevels {
  if (!value || typeof value !== "object") {
    throw new SimulationDomainError(
      "Experiment factor levels are invalid",
      "INVALID_FACTOR_LEVELS",
    );
  }

  return value as FactorLevels;
}

function parseUnits(value: unknown): FactorUnits {
  if (!value || typeof value !== "object") {
    throw new SimulationDomainError(
      "Experiment units are invalid",
      "INVALID_UNITS",
    );
  }

  return value as FactorUnits;
}

export function buildExperimentDesign(input: {
  factors: PlantGrowthFactor[];
  factorLevels: FactorLevels;
  units: FactorUnits;
  replicates: number;
  seed: number;
  simulationVersion: string;
  simulationWorldKey: SimulationWorldKey;
}): ExperimentDesign {
  return {
    factors: input.factors,
    factorLevels: input.factorLevels,
    units: input.units,
    replicates: input.replicates,
    seed: input.seed,
    simulationVersion: input.simulationVersion,
    simulationWorldKey: input.simulationWorldKey,
  };
}

export async function runSimulationForExperiment(
  input: RunSimulationInput,
): Promise<PublicSimulationResult> {
  const experiment = await db.experiment.findUnique({
    where: { id: input.experimentId },
  });

  if (!experiment) {
    throw new SimulationDomainError(
      `Experiment not found: ${input.experimentId}`,
      "NOT_FOUND",
    );
  }

  const design = buildExperimentDesign({
    factors: experiment.factors,
    factorLevels: parseFactorLevels(experiment.factorLevels),
    units: parseUnits(experiment.units),
    replicates: experiment.replicates,
    seed: experiment.seed,
    simulationVersion: experiment.simulationVersion,
    simulationWorldKey: experiment.simulationWorldKey as SimulationWorldKey,
  });

  const result = simulateExperiment(design);

  await db.simulationObservation.deleteMany({
    where: { experimentId: experiment.id },
  });

  await db.simulationObservation.createMany({
    data: result.observations.map((observation) => ({
      experimentId: experiment.id,
      dataLabel: observation.dataLabel,
      simulationVersion: observation.simulationVersion,
      replicateIndex: observation.replicateIndex,
      combinationIndex: observation.combinationIndex,
      factorValues: observation.factorValues,
      biomass: observation.biomass,
      growthRate: observation.growthRate,
      observationSeed: observation.observationSeed | 0,
    })),
  });

  return toPublicSimulationResult(result);
}
