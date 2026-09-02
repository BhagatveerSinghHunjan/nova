import { ExperimentStatus, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpCreateExperimentAction,
  webmcpReplicateExperimentAction,
  webmcpRunExperimentAction,
} from "@/app/webmcp/actions";
import {
  analyzeFactorialGrowth,
  compareReplicationAnalyses,
} from "@/domain/analysis";
import { approveExperiment } from "@/domain/experiment";
import { loadExperimentObservations } from "@/domain/persistence";
import { REPLICATION_RELATIVE_EFFECT_THRESHOLD } from "@/domain/analysis/types";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeReplicate = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-10-webmcp-replicate";

describeReplicate("WebMCP replicate_experiment server bridge", () => {
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

  async function createCompletedOriginal(seed: number) {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.10 replicate_experiment independent seed and criterion",
      hypothesis: "Replication success is calculated from observations.",
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
      approvalRationale: "Approved for LEVEL 8.10 replicate_experiment tests.",
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

  it("creates an independent replication with calculated replication_success", async () => {
    const original = await createCompletedOriginal(90_001);

    const result = await webmcpReplicateExperimentAction({
      original_experiment_id: original.experiment_id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.original_experiment_id).toBe(original.experiment_id);
    expect(result.data.replication_experiment_id).toBeTruthy();
    expect(result.data.original_seed).toBe(90_001);
    expect(result.data.replication_seed).not.toBe(result.data.original_seed);
    expect(result.data.relative_effect_difference_threshold).toBe(
      REPLICATION_RELATIVE_EFFECT_THRESHOLD,
    );

    expect(result.data.original_effect).toBeTruthy();
    expect(result.data.replication_effect).toBeTruthy();
    expect(result.data.original_confidence_interval).toBeTruthy();
    expect(result.data.replication_confidence_interval).toBeTruthy();
    expect(typeof result.data.same_direction).toBe("boolean");
    expect(typeof result.data.confidence_interval_overlap).toBe("boolean");
    expect(typeof result.data.relative_effect_difference).toBe("number");
    expect(typeof result.data.replication_success).toBe("boolean");

    expect(JSON.stringify(result.data)).not.toMatch(
      /simulationWorldKey|temperate_optimum|noiseScale|hidden/,
    );

    const replicaObs = await db.simulationObservation.findMany({
      where: { experimentId: result.data.replication_experiment_id },
    });
    const originalObs = await db.simulationObservation.findMany({
      where: { experimentId: original.experiment_id },
    });

    expect(replicaObs.length).toBeGreaterThan(0);
    expect(replicaObs.length).toBe(originalObs.length);
    expect(replicaObs.map((row) => row.biomass)).not.toEqual(
      originalObs.map((row) => row.biomass),
    );

    const expected = compareReplicationAnalyses({
      original: analyzeFactorialGrowth(
        await loadExperimentObservations(original.experiment_id),
      ),
      replication: analyzeFactorialGrowth(
        await loadExperimentObservations(result.data.replication_experiment_id),
      ),
    });

    expect(result.data.replication_success).toBe(expected.replicated);
    expect(result.data.same_direction).toBe(
      expected.replication_rule.same_direction,
    );
    expect(result.data.confidence_interval_overlap).toBe(
      expected.replication_rule.confidence_intervals_overlap,
    );

    const expectedSuccess =
      expected.replication_rule.same_direction &&
      expected.replication_rule.confidence_intervals_overlap &&
      expected.replication_rule.relative_effect_difference_below_threshold;
    expect(result.data.replication_success).toBe(expectedSuccess);

    const record = await db.replication.findUniqueOrThrow({
      where: { id: result.data.replication_id },
    });
    expect(record.replicationSuccess).toBe(expected.replicated);
    expect(record.originalSeed).not.toBe(record.replicationSeed);

    const replica = await db.experiment.findUniqueOrThrow({
      where: { id: result.data.replication_experiment_id },
    });
    expect(replica.parentExperimentId).toBe(original.experiment_id);
    expect(replica.status).toBe(ExperimentStatus.COMPLETED);

    const events = await db.experimentEvent.findMany({
      where: {
        experimentId: original.experiment_id,
        type: "replication_completed",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.metadata).toMatchObject({
      replicationId: result.data.replication_id,
      replicationExperimentId: result.data.replication_experiment_id,
      replicationSuccess: result.data.replication_success,
    });
  });

  it("rejects replication when the original has no observations", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.10 missing observations",
      hypothesis: "Cannot replicate without results.",
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
      seed: 90_002,
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

    const result = await webmcpReplicateExperimentAction({
      original_experiment_id: created.data.experiment_id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("MISSING_OBSERVATIONS");
  });
});
