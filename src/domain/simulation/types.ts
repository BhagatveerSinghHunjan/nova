import { PlantGrowthFactor } from "@prisma/client";

import type { FactorLevels, FactorUnits } from "@/domain/experiment/types";

export const SYNTHETIC_DATA_LABEL = "synthetic" as const;

export type SimulationWorldKey =
  | "temperate_optimum"
  | "tropical_optimum"
  | "water_sensitive"
  | "weak_temperature";

export type HiddenSimulationWorld = {
  key: SimulationWorldKey;
  temperatureOptimum: number;
  temperatureSpread: number;
  temperatureStrength: number;
  waterExponent: number;
  waterLightInteraction: number;
  lightOptimum: number;
  lightSpread: number;
  co2HalfSaturation: number;
  nutrientHalfSaturation: number;
  baselineGrowth: number;
  noiseScale: number;
};

export type ExperimentDesign = {
  factors: PlantGrowthFactor[];
  factorLevels: FactorLevels;
  units: FactorUnits;
  replicates: number;
  seed: number;
  simulationVersion: string;
  simulationWorldKey: SimulationWorldKey;
};

export type FactorCombination = Partial<Record<PlantGrowthFactor, number>>;

export type SyntheticObservation = {
  dataLabel: typeof SYNTHETIC_DATA_LABEL;
  simulationVersion: string;
  replicateIndex: number;
  combinationIndex: number;
  factorValues: FactorCombination;
  units: FactorUnits;
  biomass: number;
  growthRate: number;
  observationSeed: number;
};

export type PublicSyntheticObservation = Omit<
  SyntheticObservation,
  "observationSeed"
>;

export type SimulationResult = {
  dataLabel: typeof SYNTHETIC_DATA_LABEL;
  simulationVersion: string;
  observationCount: number;
  combinationCount: number;
  replicateCount: number;
  observations: SyntheticObservation[];
};

export type PublicSimulationResult = Omit<SimulationResult, "observations"> & {
  observations: PublicSyntheticObservation[];
};
