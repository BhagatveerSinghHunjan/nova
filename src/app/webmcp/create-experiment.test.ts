import { ExperimentStatus, PlantGrowthFactor, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { webmcpCreateExperimentAction } from "@/app/webmcp/actions";
import {
  parseWebMcpFactorLevels,
  parseWebMcpFactors,
  parseWebMcpUnits,
  resolvePlantGrowthFactor,
} from "@/app/webmcp/factor-input";
import { startExperiment } from "@/domain/experiment";

describe("WebMCP create_experiment factor input", () => {
  it("maps agent-facing lowercase factors to domain enums", () => {
    expect(resolvePlantGrowthFactor("temperature")).toBe(
      PlantGrowthFactor.TEMPERATURE,
    );
    expect(resolvePlantGrowthFactor("water")).toBe(PlantGrowthFactor.WATER);
    expect(resolvePlantGrowthFactor("light")).toBe(PlantGrowthFactor.LIGHT);
    expect(resolvePlantGrowthFactor("CO2")).toBe(PlantGrowthFactor.CO2);
    expect(resolvePlantGrowthFactor("nutrients")).toBe(
      PlantGrowthFactor.NUTRIENTS,
    );
  });

  it("accepts domain uppercase factor names", () => {
    expect(parseWebMcpFactors(["TEMPERATURE", "WATER"])).toEqual([
      PlantGrowthFactor.TEMPERATURE,
      PlantGrowthFactor.WATER,
    ]);
  });

  it("rejects unsupported factors with INVALID_FACTOR", () => {
    try {
      parseWebMcpFactors(["humidity"]);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_FACTOR",
        message: expect.stringContaining("humidity"),
      });
    }
  });

  it("remaps lowercase factor_levels and units keys", () => {
    expect(
      parseWebMcpFactorLevels({
        temperature: [20, 25],
        water: [0.5, 1],
      }),
    ).toEqual({
      [PlantGrowthFactor.TEMPERATURE]: [20, 25],
      [PlantGrowthFactor.WATER]: [0.5, 1],
    });

    expect(
      parseWebMcpUnits({
        temperature: "celsius",
        water: "relative",
      }),
    ).toEqual({
      [PlantGrowthFactor.TEMPERATURE]: "celsius",
      [PlantGrowthFactor.WATER]: "relative",
    });
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeCreate = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-5-webmcp-create";

describeCreate("WebMCP create_experiment server bridge", () => {
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

  it("persists AWAITING_APPROVAL with events and does not auto-run", async () => {
    const result = await webmcpCreateExperimentAction({
      question: "Does temperature interact with water?",
      hypothesis: "Temperature and water jointly affect biomass.",
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
      seed: 85_001,
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

    expect(result.data.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
    expect(result.data.approval_required).toBe(true);
    expect(result.data.estimated_observations).toBe(8);
    expect(result.data.experiment_id).toBeTruthy();

    const persisted = await db.experiment.findUniqueOrThrow({
      where: { id: result.data.experiment_id },
    });
    expect(persisted.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
    expect(persisted.approvedAt).toBeNull();

    const events = await db.experimentEvent.findMany({
      where: { experimentId: result.data.experiment_id },
      orderBy: { createdAt: "asc" },
    });
    const types = events.map((event) => event.type);
    expect(types).toContain("experiment_created");
    expect(types).toContain("approval_requested");

    await expect(
      startExperiment({ experimentId: result.data.experiment_id }),
    ).rejects.toThrow(/AWAITING_APPROVAL → RUNNING/);

    const observations = await db.simulationObservation.count({
      where: { experimentId: result.data.experiment_id },
    });
    expect(observations).toBe(0);
  });

  it("returns structured domain validation errors", async () => {
    const result = await webmcpCreateExperimentAction({
      question: "",
      hypothesis: "Hypothesis",
      factors: ["temperature"],
      factor_levels: { temperature: [20] },
      units: { temperature: "celsius" },
      replicates: 1,
      seed: 85_002,
      simulation_version: "nova-sim-v1",
      provenance: { source: "nova-lab-tests", actor: ACTOR },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toMatch(/question/i);
  });

  it("returns structured error for unsupported factors", async () => {
    const result = await webmcpCreateExperimentAction({
      question: "Q",
      hypothesis: "H",
      factors: ["pressure"],
      factor_levels: { pressure: [1] },
      units: { pressure: "kPa" },
      replicates: 1,
      seed: 85_003,
      simulation_version: "nova-sim-v1",
      provenance: { source: "nova-lab-tests", actor: ACTOR },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_FACTOR");
  });
});
