import { PlantGrowthFactor } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { countFactorCombinations } from "./design";
import {
  createReplicationSeed,
  deriveReplicateSeed,
  simulateExperiment,
  toPublicSimulationResult,
} from "./simulator";
import type { ExperimentDesign } from "./types";

const baseDesign: ExperimentDesign = {
  factors: [PlantGrowthFactor.TEMPERATURE, PlantGrowthFactor.WATER],
  factorLevels: {
    [PlantGrowthFactor.TEMPERATURE]: [20, 25, 30],
    [PlantGrowthFactor.WATER]: [0.5, 1],
  },
  units: {
    [PlantGrowthFactor.TEMPERATURE]: "celsius",
    [PlantGrowthFactor.WATER]: "relative",
  },
  replicates: 3,
  seed: 42_001,
  simulationVersion: "nova-sim-v1",
  simulationWorldKey: "temperate_optimum",
};

describe("simulateExperiment", () => {
  it("labels all generated data as synthetic", () => {
    const result = simulateExperiment(baseDesign);

    expect(result.dataLabel).toBe("synthetic");
    expect(
      result.observations.every(
        (observation) => observation.dataLabel === "synthetic",
      ),
    ).toBe(true);
  });

  it("stores the simulation version on every observation", () => {
    const result = simulateExperiment(baseDesign);

    expect(result.simulationVersion).toBe("nova-sim-v1");
    expect(
      result.observations.every(
        (observation) => observation.simulationVersion === "nova-sim-v1",
      ),
    ).toBe(true);
  });

  it("produces identical observations for the same seed and design", () => {
    const first = simulateExperiment(baseDesign);
    const second = simulateExperiment(baseDesign);

    expect(first).toEqual(second);
  });

  it("produces different observations for different seeds", () => {
    const first = simulateExperiment(baseDesign);
    const second = simulateExperiment({
      ...baseDesign,
      seed: 99_999,
    });

    expect(first.observations).not.toEqual(second.observations);
  });

  it("generates observations for every factor combination and replicate", () => {
    const result = simulateExperiment(baseDesign);
    const expectedCombinations = countFactorCombinations(
      baseDesign.factors,
      baseDesign.factorLevels,
    );

    expect(result.combinationCount).toBe(expectedCombinations);
    expect(result.replicateCount).toBe(baseDesign.replicates);
    expect(result.observationCount).toBe(
      expectedCombinations * baseDesign.replicates,
    );

    const seen = new Set<string>();
    for (const observation of result.observations) {
      const key = `${observation.replicateIndex}:${observation.combinationIndex}:${JSON.stringify(observation.factorValues)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    expect(seen.size).toBe(result.observationCount);
  });

  it("uses a different derived seed for each replicate", () => {
    const replicateSeeds = Array.from(
      { length: baseDesign.replicates },
      (_, replicateIndex) => deriveReplicateSeed(baseDesign.seed, replicateIndex),
    );

    expect(new Set(replicateSeeds).size).toBe(baseDesign.replicates);
  });

  it("generates a new seed for experiment replication", () => {
    const replicationSeed = createReplicationSeed({
      parentSeed: baseDesign.seed,
      simulationVersion: baseDesign.simulationVersion,
    });

    expect(replicationSeed).not.toBe(baseDesign.seed);
  });

  it("is deterministic for the same simulation version and world", () => {
    const temperate = simulateExperiment({
      ...baseDesign,
      simulationWorldKey: "temperate_optimum",
    });
    const temperateRepeat = simulateExperiment({
      ...baseDesign,
      simulationWorldKey: "temperate_optimum",
    });
    const tropical = simulateExperiment({
      ...baseDesign,
      simulationWorldKey: "tropical_optimum",
    });

    expect(temperate).toEqual(temperateRepeat);
    expect(temperate.observations).not.toEqual(tropical.observations);
  });

  it("does not expose hidden world metadata in public simulation results", () => {
    const result = simulateExperiment(baseDesign);
    const publicResult = toPublicSimulationResult(result);

    expect(publicResult).not.toHaveProperty("simulationWorldKey");
    expect(publicResult.observations[0]).not.toHaveProperty("observationSeed");

    for (const observation of publicResult.observations) {
      expect(observation).not.toHaveProperty("simulationWorldKey");
    }
  });
});

describe("hidden simulation worlds", () => {
  it("produces different outcomes across configured worlds", () => {
    const worlds = [
      "temperate_optimum",
      "tropical_optimum",
      "water_sensitive",
      "weak_temperature",
    ] as const;

    const biomassByWorld = worlds.map((simulationWorldKey) => {
      const result = simulateExperiment({
        ...baseDesign,
        simulationWorldKey,
        factors: [
          PlantGrowthFactor.TEMPERATURE,
          PlantGrowthFactor.WATER,
          PlantGrowthFactor.LIGHT,
        ],
        factorLevels: {
          [PlantGrowthFactor.TEMPERATURE]: [22, 30],
          [PlantGrowthFactor.WATER]: [0.5, 1.5],
          [PlantGrowthFactor.LIGHT]: [600],
        },
        units: {
          ...baseDesign.units,
          [PlantGrowthFactor.LIGHT]: "umol/m2/s",
        },
        replicates: 1,
      });

      return result.observations.map((observation) => observation.biomass);
    });

    const flattened = biomassByWorld.flat();
    expect(new Set(flattened).size).toBeGreaterThan(1);
  });
});
