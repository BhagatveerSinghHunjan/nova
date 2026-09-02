import { PlantGrowthFactor } from "@prisma/client";

import type { FactorCombination, HiddenSimulationWorld } from "./types";

const DEFAULT_FACTOR_VALUES: Record<PlantGrowthFactor, number> = {
  [PlantGrowthFactor.TEMPERATURE]: 25,
  [PlantGrowthFactor.WATER]: 1,
  [PlantGrowthFactor.LIGHT]: 600,
  [PlantGrowthFactor.CO2]: 400,
  [PlantGrowthFactor.NUTRIENTS]: 0.5,
};

function factorValue(
  combination: FactorCombination,
  factor: PlantGrowthFactor,
): number {
  return combination[factor] ?? DEFAULT_FACTOR_VALUES[factor];
}

function gaussianPeak(
  value: number,
  optimum: number,
  spread: number,
  strength: number,
): number {
  const exponent = -((value - optimum) ** 2) / (2 * spread ** 2);
  return 1 + strength * (Math.exp(exponent) - 1);
}

function saturatingResponse(value: number, halfSaturation: number): number {
  return value / (halfSaturation + value);
}

export type DeterministicGrowth = {
  biomass: number;
  growthRate: number;
};

export function computeDeterministicGrowth(
  combination: FactorCombination,
  world: HiddenSimulationWorld,
): DeterministicGrowth {
  const temperature = factorValue(combination, PlantGrowthFactor.TEMPERATURE);
  const water = factorValue(combination, PlantGrowthFactor.WATER);
  const light = factorValue(combination, PlantGrowthFactor.LIGHT);
  const co2 = factorValue(combination, PlantGrowthFactor.CO2);
  const nutrients = factorValue(combination, PlantGrowthFactor.NUTRIENTS);

  const temperatureEffect = gaussianPeak(
    temperature,
    world.temperatureOptimum,
    world.temperatureSpread,
    world.temperatureStrength,
  );

  const waterEffect = Math.pow(Math.max(water, 0), world.waterExponent);
  const waterLightEffect =
    1 + world.waterLightInteraction * water * (light / world.lightOptimum);

  const lightEffect = gaussianPeak(
    light,
    world.lightOptimum,
    world.lightSpread,
    1,
  );

  const co2Effect = saturatingResponse(co2, world.co2HalfSaturation);
  const nutrientEffect = saturatingResponse(
    nutrients,
    world.nutrientHalfSaturation,
  );

  const biomass =
    world.baselineGrowth *
    temperatureEffect *
    waterEffect *
    waterLightEffect *
    lightEffect *
    (0.5 + co2Effect) *
    (0.5 + nutrientEffect);

  const growthRate = biomass / world.baselineGrowth;

  return {
    biomass: Number(biomass.toFixed(6)),
    growthRate: Number(growthRate.toFixed(6)),
  };
}

export function applyStochasticNoise(
  deterministic: DeterministicGrowth,
  random: () => number,
  noiseScale: number,
): DeterministicGrowth {
  const noise = (random() * 2 - 1) * noiseScale;

  return {
    biomass: Number(
      Math.max(0, deterministic.biomass * (1 + noise)).toFixed(6),
    ),
    growthRate: Number(
      Math.max(0, deterministic.growthRate * (1 + noise)).toFixed(6),
    ),
  };
}
