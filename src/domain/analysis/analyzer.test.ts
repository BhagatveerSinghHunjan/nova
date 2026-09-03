import { PlantGrowthFactor } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  analyzeFactorialGrowth,
  analyzeReplicationFromDesign,
  analyzeReplicationFromObservations,
  compareReplicationAnalyses,
  FACTORIAL_GROWTH_MODEL,
} from "./index";
import { studentTQuantile } from "./math/t-distribution";
import { simulateExperiment } from "@/domain/simulation/simulator";
import type { ExperimentDesign } from "@/domain/simulation/types";

const factorialDesign: ExperimentDesign = {
  factors: [PlantGrowthFactor.TEMPERATURE, PlantGrowthFactor.WATER],
  factorLevels: {
    [PlantGrowthFactor.TEMPERATURE]: [20, 25, 30],
    [PlantGrowthFactor.WATER]: [0.5, 1],
  },
  units: {
    [PlantGrowthFactor.TEMPERATURE]: "celsius",
    [PlantGrowthFactor.WATER]: "relative",
  },
  replicates: 4,
  seed: 77_001,
  simulationVersion: "nova-sim-v1",
  simulationWorldKey: "temperate_optimum",
};

describe("analyzeFactorialGrowth", () => {
  it("returns structured machine-readable analysis from generated observations", () => {
    const simulation = simulateExperiment(factorialDesign);
    const analysis = analyzeFactorialGrowth(simulation.observations);

    expect(analysis.model).toBe(FACTORIAL_GROWTH_MODEL);
    expect(analysis.analysis_version).toBe("1.0");
    expect(analysis.response_variable).toBe("biomass");
    expect(analysis.effects.temperature).toMatchObject({
      estimate: expect.any(Number),
      standard_error: expect.any(Number),
      confidence_interval: {
        lower: expect.any(Number),
        upper: expect.any(Number),
        level: 0.95,
      },
      t_statistic: expect.any(Number),
      p_value: expect.any(Number),
      direction: expect.stringMatching(/^(positive|negative|neutral)$/),
    });
    expect(analysis.effects.water).toBeDefined();
    expect(analysis.effects.temperature_water_interaction).toBeDefined();
  });

  it("produces identical analysis for the same observations", () => {
    const simulation = simulateExperiment(factorialDesign);
    const first = analyzeFactorialGrowth(simulation.observations);
    const second = analyzeFactorialGrowth(simulation.observations);

    expect(first).toEqual(second);
  });

  it("derives effects from the observation data rather than hardcoded values", () => {
    const baseline = simulateExperiment(factorialDesign);
    const shifted = simulateExperiment({
      ...factorialDesign,
      seed: 88_002,
    });

    const baselineAnalysis = analyzeFactorialGrowth(baseline.observations);
    const shiftedAnalysis = analyzeFactorialGrowth(shifted.observations);

    expect(baselineAnalysis.effects.temperature.estimate).not.toBe(
      shiftedAnalysis.effects.temperature.estimate,
    );
  });

  it("changes effect estimates when observation responses are perturbed", () => {
    const simulation = simulateExperiment(factorialDesign);
    const analysis = analyzeFactorialGrowth(simulation.observations);

    const perturbed = simulation.observations.map((observation) => ({
      ...observation,
      biomass: observation.biomass * 1.5,
    }));
    const perturbedAnalysis = analyzeFactorialGrowth(perturbed);

    expect(perturbedAnalysis.effects.temperature.estimate).not.toBe(
      analysis.effects.temperature.estimate,
    );
  });

  it("requires temperature and water factors in observations", () => {
    const simulation = simulateExperiment({
      ...factorialDesign,
      factors: [PlantGrowthFactor.TEMPERATURE],
      factorLevels: {
        [PlantGrowthFactor.TEMPERATURE]: [20, 25],
      },
    });

    expect(() => analyzeFactorialGrowth(simulation.observations)).toThrow(
      /missing temperature or water/i,
    );
  });

  it("reports 95% CIs consistent with estimate ± t_crit(0.975, df) × SE", () => {
    const simulation = simulateExperiment(factorialDesign);
    const analysis = analyzeFactorialGrowth(simulation.observations);
    const df = analysis.residual_degrees_of_freedom;
    const tCrit = studentTQuantile(0.975, df);

    const effects = [
      analysis.effects.temperature,
      analysis.effects.water,
      analysis.effects.temperature_water_interaction,
    ];

    for (const effect of effects) {
      const { estimate, standard_error: se, confidence_interval: ci } = effect;

      expect(ci.level).toBe(0.95);
      expect(ci.lower).toBeLessThan(estimate);
      expect(estimate).toBeLessThan(ci.upper);

      const expectedHalfWidth = tCrit * se;
      const reportedHalfWidth = (ci.upper - ci.lower) / 2;

      // OLS rounds to 8 decimal places; allow tiny absolute tolerance.
      expect(reportedHalfWidth).toBeCloseTo(expectedHalfWidth, 5);
      expect(ci.lower).toBeCloseTo(estimate - expectedHalfWidth, 5);
      expect(ci.upper).toBeCloseTo(estimate + expectedHalfWidth, 5);
    }
  });
});

describe("replication analysis", () => {
  it("uses a new seed for replication observations with the same design", () => {
    const replicationSeed = 123_456;
    const original = simulateExperiment(factorialDesign);
    const replication = simulateExperiment({
      ...factorialDesign,
      seed: replicationSeed,
    });

    expect(replicationSeed).not.toBe(factorialDesign.seed);
    expect(replication.observations).not.toEqual(original.observations);
  });

  it("independently calculates effects for original and replication", () => {
    const result = analyzeReplicationFromDesign({
      design: factorialDesign,
      replicationSeed: 123_456,
    });

    expect(result.original.effects.temperature.estimate).toBeTypeOf("number");
    expect(result.replication.effects.temperature.estimate).toBeTypeOf("number");
    expect(result.comparisons.temperature.original).toEqual(
      result.original.effects.temperature,
    );
    expect(result.comparisons.temperature.replication).toEqual(
      result.replication.effects.temperature,
    );
  });

  it("marks replication successful when all explicit criteria pass", () => {
    const simulation = simulateExperiment(factorialDesign);

    const result = analyzeReplicationFromObservations({
      originalObservations: simulation.observations,
      replicationObservations: simulation.observations,
    });

    expect(result.replication_rule.same_direction).toBe(true);
    expect(result.replication_rule.confidence_intervals_overlap).toBe(true);
    expect(
      result.replication_rule.relative_effect_difference_below_threshold,
    ).toBe(true);
    expect(result.replicated).toBe(true);
  });

  it("does not mark replication successful when criteria fail", () => {
    const original = analyzeFactorialGrowth(
      simulateExperiment(factorialDesign).observations,
    );
    const divergent = analyzeFactorialGrowth(
      simulateExperiment({
        ...factorialDesign,
        seed: 999_001,
        simulationWorldKey: "tropical_optimum",
      }).observations,
    );

    const result = compareReplicationAnalyses({
      original,
      replication: divergent,
    });

    expect(result.replicated).toBe(false);
    expect(
      result.replication_rule.same_direction &&
        result.replication_rule.confidence_intervals_overlap &&
        result.replication_rule.relative_effect_difference_below_threshold,
    ).toBe(false);
  });

  it("evaluates replication from generated observations end-to-end", () => {
    const result = analyzeReplicationFromDesign({
      design: factorialDesign,
      replicationSeed: factorialDesign.seed,
    });

    expect(result.replicated).toBe(true);
    expect(result.original.sample_size).toBe(result.replication.sample_size);
  });
});

describe("factorial model fit", () => {
  it("fits a temperature × water interaction from synthetic observations", () => {
    const simulation = simulateExperiment({
      ...factorialDesign,
      simulationWorldKey: "water_sensitive",
      replicates: 6,
    });

    const analysis = analyzeFactorialGrowth(simulation.observations);
    const interaction = analysis.effects.temperature_water_interaction;

    expect(interaction.standard_error).toBeGreaterThan(0);
    expect(interaction.confidence_interval.upper).toBeGreaterThan(
      interaction.confidence_interval.lower,
    );
    expect(analysis.sample_size).toBe(simulation.observationCount);
  });
});
