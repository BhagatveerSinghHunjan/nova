import { PlantGrowthFactor } from "@prisma/client";

export const SUPPORTED_PLANT_GROWTH_FACTORS = [
  PlantGrowthFactor.TEMPERATURE,
  PlantGrowthFactor.WATER,
  PlantGrowthFactor.LIGHT,
  PlantGrowthFactor.CO2,
  PlantGrowthFactor.NUTRIENTS,
] as const;

export type SupportedPlantGrowthFactor =
  (typeof SUPPORTED_PLANT_GROWTH_FACTORS)[number];

export function isSupportedFactor(
  factor: PlantGrowthFactor,
): factor is SupportedPlantGrowthFactor {
  return SUPPORTED_PLANT_GROWTH_FACTORS.includes(
    factor as SupportedPlantGrowthFactor,
  );
}
