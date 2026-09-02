import { PlantGrowthFactor } from "@prisma/client";

import type { Matrix, Vector } from "./math/matrix";
import type { AnalysisObservation, GrowthRegressionRow } from "./types";
import { AnalysisDomainError } from "./errors";

export function extractGrowthRegressionRows(
  observations: AnalysisObservation[],
): GrowthRegressionRow[] {
  if (observations.length === 0) {
    throw new AnalysisDomainError(
      "At least one observation is required for analysis",
      "INSUFFICIENT_OBSERVATIONS",
    );
  }

  return observations.map((observation, index) => {
    const temperature =
      observation.factorValues[PlantGrowthFactor.TEMPERATURE];
    const water = observation.factorValues[PlantGrowthFactor.WATER];

    if (temperature === undefined || water === undefined) {
      throw new AnalysisDomainError(
        `Observation at index ${index} is missing temperature or water factor values`,
        "MISSING_FACTORS",
      );
    }

    return {
      temperature,
      water,
      growth: observation.biomass,
    };
  });
}

export function buildFactorialDesignMatrix(
  rows: GrowthRegressionRow[],
): {
  designMatrix: Matrix;
  response: Vector;
  termNames: string[];
} {
  const centeredTemperature = centerColumn(rows.map((row) => row.temperature));
  const centeredWater = centerColumn(rows.map((row) => row.water));

  const designMatrix = rows.map((row, index) => [
    1,
    centeredTemperature[index],
    centeredWater[index],
    centeredTemperature[index] * centeredWater[index],
  ]);

  return {
    designMatrix,
    response: rows.map((row) => row.growth),
    termNames: [
      "intercept",
      "temperature",
      "water",
      "temperature:water",
    ],
  };
}

function centerColumn(values: number[]): number[] {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value - mean);
}
