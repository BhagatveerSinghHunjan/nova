import {
  invert,
  multiply,
  multiplyVector,
  subtract,
  sumSquares,
  transpose,
  type Matrix,
  type Vector,
} from "./matrix";
import { studentTQuantile, studentTPValue } from "./t-distribution";

export type OlsTerm = {
  name: string;
  estimate: number;
  standardError: number;
  tStatistic: number;
  pValue: number;
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
};

export type OlsResult = {
  coefficients: Vector;
  terms: OlsTerm[];
  residualDegreesOfFreedom: number;
  residualStandardError: number;
  sampleSize: number;
};

export function fitOrdinaryLeastSquares(input: {
  designMatrix: Matrix;
  response: Vector;
  termNames: string[];
  confidenceLevel?: number;
}): OlsResult {
  const { designMatrix, response, termNames } = input;
  const confidenceLevel = input.confidenceLevel ?? 0.95;
  const sampleSize = response.length;
  const parameterCount = termNames.length;

  if (sampleSize <= parameterCount) {
    throw new Error(
      `Insufficient observations (${sampleSize}) for ${parameterCount} model terms`,
    );
  }

  const xTranspose = transpose(designMatrix);
  const xtx = multiply(xTranspose, designMatrix);
  const xtxInverse = invert(xtx);
  const coefficients = multiplyVector(
    multiply(xtxInverse, xTranspose),
    response,
  );
  const fitted = multiplyVector(designMatrix, coefficients);
  const residuals = subtract(response, fitted);
  const residualSumOfSquares = sumSquares(residuals);
  const residualDegreesOfFreedom = sampleSize - parameterCount;
  const residualVariance = residualSumOfSquares / residualDegreesOfFreedom;
  const residualStandardError = Math.sqrt(residualVariance);
  const covariance = xtxInverse.map((row) =>
    row.map((value) => value * residualVariance),
  );
  const alpha = 1 - confidenceLevel;
  const criticalValue = studentTQuantile(1 - alpha / 2, residualDegreesOfFreedom);

  const terms = termNames.map((name, index) => {
    const estimate = coefficients[index];
    const standardError = Math.sqrt(Math.max(covariance[index][index], 0));
    const tStatistic =
      standardError === 0 ? 0 : estimate / standardError;
    const margin = criticalValue * standardError;

    return {
      name,
      estimate: round(estimate),
      standardError: round(standardError),
      tStatistic: round(tStatistic),
      pValue: round(studentTPValue(Math.abs(tStatistic), residualDegreesOfFreedom)),
      confidenceInterval: {
        lower: round(estimate - margin),
        upper: round(estimate + margin),
        level: confidenceLevel,
      },
    };
  });

  return {
    coefficients,
    terms,
    residualDegreesOfFreedom,
    residualStandardError: round(residualStandardError),
    sampleSize,
  };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}
