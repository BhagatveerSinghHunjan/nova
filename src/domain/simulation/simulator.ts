import { PlantGrowthFactor } from "@prisma/client";

import { isSupportedFactor } from "@/domain/experiment/factors";
import type { FactorUnits } from "@/domain/experiment/types";

import { countFactorCombinations, generateFactorCombinations } from "./design";
import { SimulationDomainError } from "./errors";
import {
  applyStochasticNoise,
  computeDeterministicGrowth,
} from "./growth-model";
import {
  createSeededRandom,
  deriveObservationSeed,
  deriveReplicateSeed,
  generateReplicationSeed,
} from "./rng";
import {
  SYNTHETIC_DATA_LABEL,
  type ExperimentDesign,
  type PublicSimulationResult,
  type PublicSyntheticObservation,
  type SimulationResult,
  type SyntheticObservation,
} from "./types";
import { getSimulationWorld } from "./worlds";

function validateDesign(design: ExperimentDesign): void {
  if (design.factors.length === 0) {
    throw new SimulationDomainError(
      "Experiment design must include at least one factor",
      "INVALID_DESIGN",
    );
  }

  if (design.replicates < 1) {
    throw new SimulationDomainError(
      "Experiment design must request at least one replicate",
      "INVALID_DESIGN",
    );
  }

  if (!design.simulationVersion.trim()) {
    throw new SimulationDomainError(
      "Simulation version is required",
      "INVALID_DESIGN",
    );
  }

  for (const factor of design.factors) {
    if (!isSupportedFactor(factor)) {
      throw new SimulationDomainError(
        `Unsupported factor in design: ${factor}`,
        "INVALID_FACTOR",
      );
    }

    const levels = design.factorLevels[factor];
    if (!levels || levels.length === 0) {
      throw new SimulationDomainError(
        `Factor levels are required for ${factor}`,
        "INVALID_FACTOR_LEVELS",
      );
    }
  }
}

function filterUnits(
  factors: PlantGrowthFactor[],
  units: FactorUnits,
): FactorUnits {
  return Object.fromEntries(
    factors
      .filter((factor) => units[factor])
      .map((factor) => [factor, units[factor] as string]),
  ) as FactorUnits;
}

export function simulateExperiment(
  design: ExperimentDesign,
): SimulationResult {
  validateDesign(design);

  const world = getSimulationWorld(design.simulationWorldKey);
  const combinations = generateFactorCombinations(
    design.factors,
    design.factorLevels,
  );
  const units = filterUnits(design.factors, design.units);
  const observations: SyntheticObservation[] = [];

  for (let replicateIndex = 0; replicateIndex < design.replicates; replicateIndex += 1) {
    const replicateSeed = deriveReplicateSeed(design.seed, replicateIndex);

    for (
      let combinationIndex = 0;
      combinationIndex < combinations.length;
      combinationIndex += 1
    ) {
      const combination = combinations[combinationIndex];
      const observationSeed = deriveObservationSeed(
        replicateSeed,
        design.simulationVersion,
        design.simulationWorldKey,
        combinationIndex,
        replicateIndex,
      );
      const random = createSeededRandom(observationSeed);
      const deterministic = computeDeterministicGrowth(combination, world);
      const noisy = applyStochasticNoise(
        deterministic,
        random,
        world.noiseScale,
      );

      observations.push({
        dataLabel: SYNTHETIC_DATA_LABEL,
        simulationVersion: design.simulationVersion,
        replicateIndex,
        combinationIndex,
        factorValues: combination,
        units,
        biomass: noisy.biomass,
        growthRate: noisy.growthRate,
        observationSeed,
      });
    }
  }

  return {
    dataLabel: SYNTHETIC_DATA_LABEL,
    simulationVersion: design.simulationVersion,
    observationCount: observations.length,
    combinationCount: combinations.length,
    replicateCount: design.replicates,
    observations,
  };
}

function toPublicObservation(
  observation: SyntheticObservation,
): PublicSyntheticObservation {
  return {
    dataLabel: observation.dataLabel,
    simulationVersion: observation.simulationVersion,
    replicateIndex: observation.replicateIndex,
    combinationIndex: observation.combinationIndex,
    factorValues: observation.factorValues,
    units: observation.units,
    biomass: observation.biomass,
    growthRate: observation.growthRate,
  };
}

export function toPublicSimulationResult(
  result: SimulationResult,
): PublicSimulationResult {
  return {
    dataLabel: result.dataLabel,
    simulationVersion: result.simulationVersion,
    observationCount: result.observationCount,
    combinationCount: result.combinationCount,
    replicateCount: result.replicateCount,
    observations: result.observations.map(toPublicObservation),
  };
}

export function createReplicationSeed(input: {
  parentSeed: number;
  simulationVersion: string;
}): number {
  return generateReplicationSeed(input.parentSeed, input.simulationVersion);
}

export {
  countFactorCombinations,
  deriveReplicateSeed,
  generateReplicationSeed,
};
