import {
  ExperimentStatus,
  PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpCreateExperimentAction,
  webmcpRunExperimentAction,
} from "@/app/webmcp/actions";
import { approveExperiment } from "@/domain/experiment";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeRun = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-6-webmcp-run";

describeRun("WebMCP run_experiment server bridge", () => {
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

  async function createAwaiting(seed: number) {
    const created = await webmcpCreateExperimentAction({
      question: "Does temperature interact with water under run_experiment?",
      hypothesis: "Joint effects appear in synthetic biomass.",
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

    return created.data;
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

  it("1. WebMCP run before approval fails with HUMAN_APPROVAL_REQUIRED", async () => {
    const awaiting = await createAwaiting(86_001);

    const result = await webmcpRunExperimentAction({
      experiment_id: awaiting.experiment_id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("HUMAN_APPROVAL_REQUIRED");
    expect(result.error.experiment_id).toBe(awaiting.experiment_id);

    const persisted = await db.experiment.findUniqueOrThrow({
      where: { id: awaiting.experiment_id },
    });
    expect(persisted.status).toBe(ExperimentStatus.AWAITING_APPROVAL);

    const observations = await db.simulationObservation.count({
      where: { experimentId: awaiting.experiment_id },
    });
    expect(observations).toBe(0);

    const startedEvents = await db.experimentEvent.count({
      where: {
        experimentId: awaiting.experiment_id,
        type: "experiment_started",
      },
    });
    expect(startedEvents).toBe(0);
  });

  it("2–5. WebMCP run after approval succeeds with observations, state, and events", async () => {
    const awaiting = await createAwaiting(86_002);

    await approveExperiment({
      experimentId: awaiting.experiment_id,
      approvalRationale: "Approved for LEVEL 8.6 WebMCP run_experiment tests.",
    });

    const result = await webmcpRunExperimentAction({
      experiment_id: awaiting.experiment_id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.experiment_id).toBe(awaiting.experiment_id);
    expect(result.data.status).toBe(ExperimentStatus.COMPLETED);
    expect(result.data.observation_count).toBeGreaterThan(0);
    expect(result.data.seed).toBe(86_002);
    expect(result.data.simulation_version).toBe("nova-sim-v1");
    expect(JSON.stringify(result.data)).not.toMatch(/simulationWorldKey|temperate_optimum|noiseScale/);

    const persisted = await db.experiment.findUniqueOrThrow({
      where: { id: awaiting.experiment_id },
    });
    expect(persisted.status).toBe(ExperimentStatus.COMPLETED);
    expect(persisted.startedAt).toBeTruthy();
    expect(persisted.completedAt).toBeTruthy();

    const observations = await db.simulationObservation.findMany({
      where: { experimentId: awaiting.experiment_id },
    });
    expect(observations.length).toBe(result.data.observation_count);
    expect(observations.length).toBe(8);
    expect(
      observations.every((row) => row.simulationVersion === "nova-sim-v1"),
    ).toBe(true);
    expect(observations.every((row) => row.dataLabel === "synthetic")).toBe(
      true,
    );

    const eventTypes = (
      await db.experimentEvent.findMany({
        where: { experimentId: awaiting.experiment_id },
        orderBy: { createdAt: "asc" },
      })
    ).map((event) => event.type);

    expect(eventTypes).toContain("experiment_created");
    expect(eventTypes).toContain("approval_requested");
    expect(eventTypes).toContain("approval_granted");
    expect(eventTypes).toContain("experiment_started");
    expect(eventTypes).toContain("experiment_completed");
  });
});
