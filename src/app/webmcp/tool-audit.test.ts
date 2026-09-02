import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpCreateExperimentAction,
  webmcpRunExperimentAction,
} from "@/app/webmcp/actions";
import { approveExperiment } from "@/domain/experiment";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeAudit = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-11-webmcp-tool-audit";

describeAudit("WebMCP tool_call audit events", () => {
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

  it("records tool_call_started/completed around create without replacing domain events", async () => {
    const result = await webmcpCreateExperimentAction({
      question: "LEVEL 8.11 tool audit create",
      hypothesis: "Tool events wrap domain events.",
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
      seed: 91_001,
      simulation_version: "nova-sim-v1",
      provenance: {
        source: "nova-lab-tests",
        actor: ACTOR,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const events = await db.experimentEvent.findMany({
      where: { experimentId: result.data.experiment_id },
      orderBy: { createdAt: "asc" },
    });
    const types = events.map((event) => event.type);

    expect(types).toContain("experiment_created");
    expect(types).toContain("approval_requested");
    expect(types).toContain("tool_call_started");
    expect(types).toContain("tool_call_completed");

    const started = events.find((event) => event.type === "tool_call_started");
    const completed = events.find(
      (event) => event.type === "tool_call_completed",
    );

    expect(started?.metadata).toMatchObject({
      toolName: "create_experiment",
      experiment_id: result.data.experiment_id,
    });
    expect(completed?.metadata).toMatchObject({
      toolName: "create_experiment",
      success: true,
      experiment_id: result.data.experiment_id,
    });

    const startedIndex = types.indexOf("tool_call_started");
    const completedIndex = types.indexOf("tool_call_completed");
    expect(startedIndex).toBeGreaterThanOrEqual(0);
    expect(completedIndex).toBeGreaterThan(startedIndex);
  });

  it("records failed tool_call_completed for run before approval", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.11 tool audit failed run",
      hypothesis: "Failure is audited.",
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
      seed: 91_002,
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

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });
    expect(ran.ok).toBe(false);

    const events = await db.experimentEvent.findMany({
      where: {
        experimentId: created.data.experiment_id,
        type: { in: ["tool_call_started", "tool_call_completed"] },
      },
      orderBy: { createdAt: "asc" },
    });

    const runStarted = events.filter(
      (event) =>
        event.type === "tool_call_started" &&
        (event.metadata as { toolName?: string }).toolName === "run_experiment",
    );
    const runCompleted = events.filter(
      (event) =>
        event.type === "tool_call_completed" &&
        (event.metadata as { toolName?: string }).toolName === "run_experiment",
    );

    expect(runStarted).toHaveLength(1);
    expect(runCompleted).toHaveLength(1);
    expect(runCompleted[0]?.metadata).toMatchObject({
      toolName: "run_experiment",
      success: false,
      error: {
        code: "HUMAN_APPROVAL_REQUIRED",
      },
    });

    expect(
      events.some((event) => event.type === "experiment_started"),
    ).toBe(false);
  });

  it("keeps domain lifecycle events when run succeeds after approval", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.11 tool audit successful run",
      hypothesis: "Domain events remain.",
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
      seed: 91_003,
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

    await approveExperiment({
      experimentId: created.data.experiment_id,
      approvalRationale: "Approved for LEVEL 8.11 audit tests.",
    });

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });
    expect(ran.ok).toBe(true);

    const types = (
      await db.experimentEvent.findMany({
        where: { experimentId: created.data.experiment_id },
        orderBy: { createdAt: "asc" },
      })
    ).map((event) => event.type);

    expect(types).toEqual(
      expect.arrayContaining([
        "tool_call_started",
        "experiment_started",
        "experiment_completed",
        "tool_call_completed",
        "approval_granted",
      ]),
    );

    const completed = (
      await db.experimentEvent.findMany({
        where: {
          experimentId: created.data.experiment_id,
          type: "tool_call_completed",
        },
      })
    ).find(
      (event) =>
        (event.metadata as { toolName?: string }).toolName === "run_experiment",
    );

    expect(completed?.metadata).toMatchObject({
      success: true,
      observation_count: expect.any(Number),
    });
  });
});
