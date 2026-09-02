import { ExperimentStatus, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpAnalyzeResultsAction,
  webmcpCreateExperimentAction,
  webmcpRunExperimentAction,
} from "@/app/webmcp/actions";
import { analyzeFactorialGrowth } from "@/domain/analysis";
import { approveExperiment } from "@/domain/experiment";
import { loadExperimentObservations } from "@/domain/persistence";
import {
  FACTORIAL_GROWTH_MODEL,
  ANALYSIS_VERSION,
} from "@/domain/analysis/types";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeAnalyze = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-8-webmcp-analyze";

describeAnalyze("WebMCP analyze_results server bridge", () => {
  const db = new PrismaClient();

  async function cleanup() {
    const owned = await db.experiment.findMany({
      where: { provenance: { path: ["actor"], equals: ACTOR } },
      select: { id: true },
    });
    const ids = owned.map((row) => row.id);
    if (ids.length === 0) {
      return;
    }

    await db.finding.deleteMany({ where: { experimentId: { in: ids } } });
    await db.replication.deleteMany({
      where: {
        OR: [
          { originalExperimentId: { in: ids } },
          { replicationExperimentId: { in: ids } },
        ],
      },
    });
    await db.analysis.deleteMany({ where: { experimentId: { in: ids } } });
    await db.simulationObservation.deleteMany({
      where: { experimentId: { in: ids } },
    });
    await db.experimentEvent.deleteMany({
      where: { experimentId: { in: ids } },
    });
    await db.experiment.updateMany({
      where: { id: { in: ids } },
      data: { parentExperimentId: null },
    });
    await db.experiment.deleteMany({ where: { id: { in: ids } } });
  }

  async function createCompletedExperiment(seed: number) {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.8 analyze_results from persisted observations",
      hypothesis: "Effects are calculated, not hardcoded.",
      factors: ["temperature", "water"],
      factor_levels: {
        temperature: [20, 25],
        water: [0.5, 1],
      },
      units: {
        temperature: "celsius",
        water: "relative",
      },
      replicates: 2,
      seed,
      simulation_version: "nova-sim-v1",
      provenance: {
        source: "nova-lab-tests",
        actor: ACTOR,
      },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    await approveExperiment({
      experimentId: created.data.experiment_id,
      approvalRationale: "Approved for LEVEL 8.8 analyze_results tests.",
    });

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });
    expect(ran.ok).toBe(true);
    if (!ran.ok) {
      throw new Error(ran.error.message);
    }

    return ran.data;
  }

  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  it("validates experiment_id", async () => {
    const result = await webmcpAnalyzeResultsAction({ experiment_id: "  " });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("persists calculated analysis matching the statistical engine and events", async () => {
    const completed = await createCompletedExperiment(88_001);

    const observations = await loadExperimentObservations(
      completed.experiment_id,
    );
    const expected = analyzeFactorialGrowth(observations);

    const result = await webmcpAnalyzeResultsAction({
      experiment_id: completed.experiment_id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.experiment_id).toBe(completed.experiment_id);
    expect(result.data.analysis_id).toBeTruthy();
    expect(result.data.status).toBe(ExperimentStatus.ANALYZED);
    expect(result.data.analysis_version).toBe(ANALYSIS_VERSION);
    expect(result.data.model_specification).toBe(FACTORIAL_GROWTH_MODEL);
    expect(result.data.model).toBe(FACTORIAL_GROWTH_MODEL);
    expect(result.data.simulation_version).toBe("nova-sim-v1");
    expect(result.data.seed).toBe(88_001);
    expect(result.data.sample_size).toBe(expected.sample_size);

    const tempEffect = result.data.factor_effects.temperature as {
      estimate: number;
      confidence_interval: { lower: number; upper: number };
      t_statistic: number;
      p_value: number;
    };
    expect(tempEffect.estimate).toBeCloseTo(
      expected.effects.temperature.estimate,
      10,
    );
    expect(tempEffect.confidence_interval.lower).toBeCloseTo(
      expected.effects.temperature.confidence_interval.lower,
      10,
    );
    expect(tempEffect.t_statistic).toBeCloseTo(
      expected.effects.temperature.t_statistic,
      10,
    );
    expect(tempEffect.p_value).toBeCloseTo(
      expected.effects.temperature.p_value,
      10,
    );

    const interaction = result.data.interaction_effects
      .temperature_water_interaction as { estimate: number };
    expect(interaction.estimate).toBeCloseTo(
      expected.effects.temperature_water_interaction.estimate,
      10,
    );

    expect(result.data.confidence_intervals.temperature).toBeTruthy();
    expect(result.data.significance_statistics.water).toMatchObject({
      t_statistic: expect.any(Number),
      p_value: expect.any(Number),
      standard_error: expect.any(Number),
    });

    expect(JSON.stringify(result.data)).not.toMatch(
      /simulationWorldKey|temperate_optimum|noiseScale|hidden/,
    );

    const persisted = await db.analysis.findUniqueOrThrow({
      where: { id: result.data.analysis_id },
    });
    expect(persisted.experimentId).toBe(completed.experiment_id);
    expect(persisted.analysisVersion).toBe(ANALYSIS_VERSION);

    const experiment = await db.experiment.findUniqueOrThrow({
      where: { id: completed.experiment_id },
    });
    expect(experiment.status).toBe(ExperimentStatus.ANALYZED);

    const events = await db.experimentEvent.findMany({
      where: {
        experimentId: completed.experiment_id,
        type: "analysis_completed",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.metadata).toMatchObject({
      analysisId: result.data.analysis_id,
      analysisVersion: ANALYSIS_VERSION,
    });
  });

  it("rejects analysis before the experiment is COMPLETED", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.8 premature analyze",
      hypothesis: "Must fail until COMPLETED.",
      factors: ["temperature", "water"],
      factor_levels: {
        temperature: [20, 25],
        water: [0.5, 1],
      },
      units: {
        temperature: "celsius",
        water: "relative",
      },
      replicates: 2,
      seed: 88_002,
      simulation_version: "nova-sim-v1",
      provenance: {
        source: "nova-lab-tests",
        actor: ACTOR,
      },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const result = await webmcpAnalyzeResultsAction({
      experiment_id: created.data.experiment_id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_STATUS");
  });

  it("produces different effect estimates for different observation seeds", async () => {
    const first = await createCompletedExperiment(88_101);
    const second = await createCompletedExperiment(88_202);

    const analysisA = await webmcpAnalyzeResultsAction({
      experiment_id: first.experiment_id,
    });
    const analysisB = await webmcpAnalyzeResultsAction({
      experiment_id: second.experiment_id,
    });

    expect(analysisA.ok && analysisB.ok).toBe(true);
    if (!analysisA.ok || !analysisB.ok) {
      return;
    }

    const estimateA = (
      analysisA.data.factor_effects.temperature as { estimate: number }
    ).estimate;
    const estimateB = (
      analysisB.data.factor_effects.temperature as { estimate: number }
    ).estimate;

    expect(estimateA).not.toBe(estimateB);
  });
});
