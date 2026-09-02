import { ExperimentStatus, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpCreateExperimentAction,
  webmcpGetResultsAction,
  webmcpRunExperimentAction,
} from "@/app/webmcp/actions";
import { approveExperiment } from "@/domain/experiment";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeGetResults = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-7-webmcp-get-results";

describeGetResults("WebMCP get_results server bridge", () => {
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
      question: "LEVEL 8.7 get_results observation retrieval",
      hypothesis: "Persisted observations are returned unchanged.",
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
      approvalRationale: "Approved for LEVEL 8.7 get_results tests.",
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
    const result = await webmcpGetResultsAction({ experiment_id: "   " });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("returns persisted observations without regenerating them", async () => {
    const completed = await createCompletedExperiment(87_001);

    const beforeRows = await db.simulationObservation.findMany({
      where: { experimentId: completed.experiment_id },
      orderBy: [{ replicateIndex: "asc" }, { combinationIndex: "asc" }],
    });
    expect(beforeRows.length).toBeGreaterThan(0);

    const first = await webmcpGetResultsAction({
      experiment_id: completed.experiment_id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(first.data.experiment_id).toBe(completed.experiment_id);
    expect(first.data.observation_count).toBe(beforeRows.length);
    expect(first.data.observations).toHaveLength(beforeRows.length);

    const sample = first.data.observations[0];
    expect(sample.factor_values).toBeTruthy();
    expect(sample.measured_outcome.biomass).toBeTypeOf("number");
    expect(sample.measured_outcome.growth_rate).toBeTypeOf("number");
    expect(sample.replicate_index).toBeTypeOf("number");
    expect(sample.combination_index).toBeTypeOf("number");

    const matched = beforeRows.find(
      (row) =>
        row.replicateIndex === sample.replicate_index &&
        row.combinationIndex === sample.combination_index &&
        row.biomass === sample.biomass &&
        row.growthRate === sample.growth_rate,
    );
    expect(matched).toBeTruthy();

    const second = await webmcpGetResultsAction({
      experiment_id: completed.experiment_id,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    const afterRows = await db.simulationObservation.findMany({
      where: { experimentId: completed.experiment_id },
    });
    expect(afterRows.length).toBe(beforeRows.length);
    expect(second.data.observation_count).toBe(beforeRows.length);
    expect(second.data.observations.map((row) => row.biomass)).toEqual(
      first.data.observations.map((row) => row.biomass),
    );

    const experiment = await db.experiment.findUniqueOrThrow({
      where: { id: completed.experiment_id },
    });
    expect(experiment.status).toBe(ExperimentStatus.COMPLETED);
  });

  it("records results_retrieved events from the domain retrieval operation", async () => {
    const completed = await createCompletedExperiment(87_002);

    await webmcpGetResultsAction({
      experiment_id: completed.experiment_id,
    });
    await webmcpGetResultsAction({
      experiment_id: completed.experiment_id,
    });

    const retrievedEvents = await db.experimentEvent.findMany({
      where: {
        experimentId: completed.experiment_id,
        type: "results_retrieved",
      },
    });

    expect(retrievedEvents.length).toBeGreaterThanOrEqual(2);
    expect(retrievedEvents[0]?.metadata).toMatchObject({
      observationCount: completed.observation_count,
    });
  });

  it("returns NOT_FOUND for unknown experiment_id", async () => {
    const result = await webmcpGetResultsAction({
      experiment_id: "00000000-0000-4000-8000-000000000099",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
