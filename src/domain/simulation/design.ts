import { PlantGrowthFactor } from "@prisma/client";

import type { FactorLevels } from "@/domain/experiment/types";

import type { FactorCombination } from "./types";

export function generateFactorCombinations(
  factors: PlantGrowthFactor[],
  factorLevels: FactorLevels,
): FactorCombination[] {
  if (factors.length === 0) {
    return [];
  }

  const orderedFactors = [...factors];

  function buildCombinations(index: number): FactorCombination[] {
    if (index >= orderedFactors.length) {
      return [{}];
    }

    const factor = orderedFactors[index];
    const levels = factorLevels[factor];

    if (!levels || levels.length === 0) {
      throw new Error(`Missing factor levels for ${factor}`);
    }

    const rest = buildCombinations(index + 1);
    const combinations: FactorCombination[] = [];

    for (const level of levels) {
      for (const partial of rest) {
        combinations.push({
          ...partial,
          [factor]: level,
        });
      }
    }

    return combinations;
  }

  return buildCombinations(0);
}

export function countFactorCombinations(
  factors: PlantGrowthFactor[],
  factorLevels: FactorLevels,
): number {
  return factors.reduce((total, factor) => {
    const levels = factorLevels[factor];
    return total * (levels?.length ?? 0);
  }, 1);
}
