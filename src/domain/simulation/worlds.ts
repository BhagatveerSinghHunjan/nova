import type { HiddenSimulationWorld, SimulationWorldKey } from "./types";

export const SIMULATION_WORLDS: readonly HiddenSimulationWorld[] = [
  {
    key: "temperate_optimum",
    temperatureOptimum: 22,
    temperatureSpread: 4,
    temperatureStrength: 1,
    waterExponent: 1,
    waterLightInteraction: 0.05,
    lightOptimum: 600,
    lightSpread: 150,
    co2HalfSaturation: 400,
    nutrientHalfSaturation: 0.5,
    baselineGrowth: 10,
    noiseScale: 0.35,
  },
  {
    key: "tropical_optimum",
    temperatureOptimum: 30,
    temperatureSpread: 5,
    temperatureStrength: 1,
    waterExponent: 1,
    waterLightInteraction: 0.05,
    lightOptimum: 700,
    lightSpread: 180,
    co2HalfSaturation: 450,
    nutrientHalfSaturation: 0.55,
    baselineGrowth: 11,
    noiseScale: 0.35,
  },
  {
    key: "water_sensitive",
    temperatureOptimum: 25,
    temperatureSpread: 5,
    temperatureStrength: 0.8,
    waterExponent: 1.8,
    waterLightInteraction: 0.45,
    lightOptimum: 650,
    lightSpread: 160,
    co2HalfSaturation: 420,
    nutrientHalfSaturation: 0.5,
    baselineGrowth: 9.5,
    noiseScale: 0.4,
  },
  {
    key: "weak_temperature",
    temperatureOptimum: 25,
    temperatureSpread: 20,
    temperatureStrength: 0.15,
    waterExponent: 1,
    waterLightInteraction: 0.05,
    lightOptimum: 600,
    lightSpread: 150,
    co2HalfSaturation: 400,
    nutrientHalfSaturation: 0.5,
    baselineGrowth: 10,
    noiseScale: 0.3,
  },
] as const;

const worldByKey = new Map<SimulationWorldKey, HiddenSimulationWorld>(
  SIMULATION_WORLDS.map((world) => [world.key, world]),
);

export function getSimulationWorld(
  key: SimulationWorldKey,
): HiddenSimulationWorld {
  const world = worldByKey.get(key);

  if (!world) {
    throw new Error(`Unknown simulation world: ${key}`);
  }

  return world;
}

export function listSimulationWorldKeys(): SimulationWorldKey[] {
  return SIMULATION_WORLDS.map((world) => world.key);
}
