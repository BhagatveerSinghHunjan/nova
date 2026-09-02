import { fitOrdinaryLeastSquares, type OlsTerm } from "./math/ols";
import {
  buildFactorialDesignMatrix,
  extractGrowthRegressionRows,
} from "./factorial-model";
import {
  ANALYSIS_VERSION,
  FACTORIAL_GROWTH_MODEL,
  type AnalysisObservation,
  type EffectDirection,
  type EffectEstimate,
  type FactorialGrowthAnalysis,
} from "./types";

function effectDirection(estimate: number): EffectDirection {
  if (estimate > 0) {
    return "positive";
  }

  if (estimate < 0) {
    return "negative";
  }

  return "neutral";
}

function toEffectEstimate(term: OlsTerm): EffectEstimate {
  return {
    estimate: term.estimate,
    standard_error: term.standardError,
    confidence_interval: {
      lower: term.confidenceInterval.lower,
      upper: term.confidenceInterval.upper,
      level: term.confidenceInterval.level,
    },
    t_statistic: term.tStatistic,
    p_value: term.pValue,
    direction: effectDirection(term.estimate),
  };
}

function findTerm(terms: OlsTerm[], name: string): OlsTerm {
  const term = terms.find((candidate) => candidate.name === name);

  if (!term) {
    throw new Error(`Missing regression term: ${name}`);
  }

  return term;
}

export function analyzeFactorialGrowth(
  observations: AnalysisObservation[],
): FactorialGrowthAnalysis {
  const rows = extractGrowthRegressionRows(observations);
  const { designMatrix, response, termNames } =
    buildFactorialDesignMatrix(rows);
  const fit = fitOrdinaryLeastSquares({
    designMatrix,
    response,
    termNames,
  });

  return {
    effects: {
      temperature: toEffectEstimate(findTerm(fit.terms, "temperature")),
      water: toEffectEstimate(findTerm(fit.terms, "water")),
      temperature_water_interaction: toEffectEstimate(
        findTerm(fit.terms, "temperature:water"),
      ),
    },
    model: FACTORIAL_GROWTH_MODEL,
    analysis_version: ANALYSIS_VERSION,
    response_variable: "biomass",
    sample_size: fit.sampleSize,
    residual_degrees_of_freedom: fit.residualDegreesOfFreedom,
    residual_standard_error: fit.residualStandardError,
  };
}
