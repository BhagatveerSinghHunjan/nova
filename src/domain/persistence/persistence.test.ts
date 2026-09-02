import { PlantGrowthFactor, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  approveExperiment,
  createExperiment,
  markAnalyzed,
  markReplicated,
  startExperiment,
  submitExperimentForApproval,
  completeExperiment,
} from "@/domain/experiment";
import { assertValidTransition } from "@/domain/experiment/state-machine";
import { ExperimentStatus } from "@prisma/client";
import {
  createFinding,
  persistReplication,
  traceFindingProvenance,
} from "@/domain/persistence";
import { createReplicationSeed } from "@/domain/simulation";
import { compareReplicationAnalyses } from "@/domain/analysis";
import { analyzeFactorialGrowth } from "@/domain/analysis";
import { loadExperimentObservations } from "@/domain/persistence";

const DATABASE_URL = process.env.DATABASE_URL;

const hasDatabase = Boolean(DATABASE_URL);

const describePersistence = hasDatabase ? describe : describe.skip;

describePersistence("LEVEL 6 persistence + provenance", () => {
  const db = new PrismaClient();

  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    const owned = await db.experiment.findMany({
      where: {
        provenance: {
          path: ["actor"],
          equals: "level6-runner",
        },
      },
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
  });

  const designInput = {
    question: "Does temperature interact with water for biomass?",
    hypothesis: "Temperature and water jointly affect biomass.",
    factors: [PlantGrowthFactor.TEMPERATURE, PlantGrowthFactor.WATER],
    factorLevels: {
      [PlantGrowthFactor.TEMPERATURE]: [20, 25, 30],
      [PlantGrowthFactor.WATER]: [0.5, 1],
    },
    units: {
      [PlantGrowthFactor.TEMPERATURE]: "celsius",
      [PlantGrowthFactor.WATER]: "relative",
    },
    replicates: 3,
    seed: 42_001,
    simulationVersion: "nova-sim-v1",
    provenance: {
      source: "nova-lab-tests",
      actor: "level6-runner",
    },
  };

  async function createApprovedRunningExperiment(seed = designInput.seed) {
    const experiment = await createExperiment({
      ...designInput,
      seed,
    });

    await submitExperimentForApproval({ experimentId: experiment.id });
    await approveExperiment({
      experimentId: experiment.id,
      approvalRationale: "Design is scientifically sound for Level 6 tests.",
    });
    const running = await startExperiment({ experimentId: experiment.id });
    return running;
  }

  it("1. experiment persists", async () => {
    const experiment = await createExperiment(designInput);
    const loaded = await db.experiment.findUnique({
      where: { id: experiment.id },
    });

    expect(loaded).not.toBeNull();
    expect(loaded?.question).toBe(designInput.question);
    expect(loaded?.seed).toBe(designInput.seed);
    expect(loaded?.simulationVersion).toBe(designInput.simulationVersion);
    expect(loaded?.status).toBe(ExperimentStatus.DRAFT);
  });

  it("2. experiment survives server restart", async () => {
    const experiment = await createExperiment(designInput);
    const experimentId = experiment.id;

    await db.$disconnect();

    const restarted = new PrismaClient();
    await restarted.$connect();

    const loaded = await restarted.experiment.findUnique({
      where: { id: experimentId },
    });

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(experimentId);
    expect(loaded?.hypothesis).toBe(designInput.hypothesis);

    await restarted.$disconnect();
    await db.$connect();
  });

  it("3. observations persist", async () => {
    const running = await createApprovedRunningExperiment();
    const observations = await db.simulationObservation.findMany({
      where: { experimentId: running.id },
    });

    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every((row) => row.dataLabel === "synthetic")).toBe(
      true,
    );
    expect(observations.every((row) => row.experimentId === running.id)).toBe(
      true,
    );
    expect(
      observations.every((row) => typeof row.biomass === "number"),
    ).toBe(true);
  });

  it("4. analysis persists", async () => {
    const running = await createApprovedRunningExperiment();
    await completeExperiment({ experimentId: running.id });
    await markAnalyzed({ experimentId: running.id });

    const analyses = await db.analysis.findMany({
      where: { experimentId: running.id },
    });

    expect(analyses).toHaveLength(1);
    expect(analyses[0].analysisVersion).toBe("1.0");
    expect(analyses[0].model).toContain("temperature");
    expect(analyses[0].effects).toBeTruthy();
    expect(analyses[0].seed).toBe(running.seed);
    expect(analyses[0].simulationVersion).toBe(running.simulationVersion);
  });

  it("5. findings persist", async () => {
    const running = await createApprovedRunningExperiment();
    await completeExperiment({ experimentId: running.id });
    await markAnalyzed({ experimentId: running.id });

    const analysis = await db.analysis.findFirstOrThrow({
      where: { experimentId: running.id },
    });

    const finding = await createFinding({
      experimentId: running.id,
      analysisId: analysis.id,
      findingText: "Temperature has a measurable main effect on biomass.",
      confidence: 0.86,
    });

    const loaded = await db.finding.findUnique({ where: { id: finding.id } });
    expect(loaded).not.toBeNull();
    expect(loaded?.analysisId).toBe(analysis.id);
    expect(loaded?.experimentId).toBe(running.id);
  });

  it("6. replication persists", async () => {
    const original = await createApprovedRunningExperiment(50_001);
    await completeExperiment({ experimentId: original.id });
    await markAnalyzed({ experimentId: original.id });

    const replicationSeed = createReplicationSeed({
      parentSeed: original.seed,
      simulationVersion: original.simulationVersion,
    });

    const replica = await createExperiment({
      ...designInput,
      seed: replicationSeed,
      provenance: {
        source: "nova-lab-tests",
        actor: "level6-runner",
        parentExperimentId: original.id,
      },
    });

    await submitExperimentForApproval({ experimentId: replica.id });
    await approveExperiment({
      experimentId: replica.id,
      approvalRationale: "Replication of approved design.",
    });
    await startExperiment({ experimentId: replica.id });
    await completeExperiment({ experimentId: replica.id });
    await markAnalyzed({ experimentId: replica.id });

    const replication = await persistReplication({
      originalExperimentId: original.id,
      replicationExperimentId: replica.id,
    });

    expect(replication.originalSeed).toBe(original.seed);
    expect(replication.replicationSeed).toBe(replica.seed);
    expect(replication.originalSeed).not.toBe(replication.replicationSeed);

    const loaded = await db.replication.findUnique({
      where: { id: replication.id },
    });
    expect(loaded).not.toBeNull();
  });

  it("7. provenance can trace a finding back to its experiment and observations", async () => {
    const running = await createApprovedRunningExperiment();
    await completeExperiment({ experimentId: running.id });
    await markAnalyzed({ experimentId: running.id });

    const analysis = await db.analysis.findFirstOrThrow({
      where: { experimentId: running.id },
    });

    const finding = await createFinding({
      experimentId: running.id,
      analysisId: analysis.id,
      findingText: "Water main effect is positive under the fitted model.",
      confidence: 0.9,
    });

    const provenance = await traceFindingProvenance(finding.id);

    expect(provenance.analysis.id).toBe(analysis.id);
    expect(provenance.experiment.id).toBe(running.id);
    expect(provenance.experiment.observations.length).toBeGreaterThan(0);
    expect(provenance.analysis.experimentId).toBe(running.id);
  });

  it("8. original and replication seeds are different", async () => {
    const original = await createApprovedRunningExperiment(60_001);
    const replicationSeed = createReplicationSeed({
      parentSeed: original.seed,
      simulationVersion: original.simulationVersion,
    });

    expect(replicationSeed).not.toBe(original.seed);

    const replica = await createExperiment({
      ...designInput,
      seed: replicationSeed,
      provenance: {
        source: "nova-lab-tests",
        actor: "level6-runner",
        parentExperimentId: original.id,
      },
    });

    expect(replica.seed).not.toBe(original.seed);
  });

  it("9. replication_success is calculated rather than hardcoded", async () => {
    const original = await createApprovedRunningExperiment(70_001);
    await completeExperiment({ experimentId: original.id });
    await markAnalyzed({ experimentId: original.id });

    const replicationSeed = createReplicationSeed({
      parentSeed: original.seed,
      simulationVersion: original.simulationVersion,
    });

    const replica = await createExperiment({
      ...designInput,
      seed: replicationSeed,
      provenance: {
        source: "nova-lab-tests",
        actor: "level6-runner",
        parentExperimentId: original.id,
      },
    });

    await submitExperimentForApproval({ experimentId: replica.id });
    await approveExperiment({
      experimentId: replica.id,
      approvalRationale: "Replication of approved design.",
    });
    await startExperiment({ experimentId: replica.id });
    await completeExperiment({ experimentId: replica.id });

    const originalObs = await loadExperimentObservations(original.id);
    const replicaObs = await loadExperimentObservations(replica.id);
    const expected = compareReplicationAnalyses({
      original: analyzeFactorialGrowth(originalObs),
      replication: analyzeFactorialGrowth(replicaObs),
    });

    const replication = await persistReplication({
      originalExperimentId: original.id,
      replicationExperimentId: replica.id,
    });

    expect(replication.replicationSuccess).toBe(expected.replicated);
    expect(replication.sameDirection).toBe(
      expected.replication_rule.same_direction,
    );
    expect(replication.confidenceIntervalOverlap).toBe(
      expected.replication_rule.confidence_intervals_overlap,
    );

    if (expected.replicated) {
      await markAnalyzed({ experimentId: replica.id });
      await markReplicated({ experimentId: original.id });
      const updated = await db.experiment.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(updated.status).toBe(ExperimentStatus.REPLICATED);
    }
  });

  it("10. invalid state transitions remain impossible", async () => {
    const draft = await createExperiment(designInput);

    await expect(
      startExperiment({ experimentId: draft.id }),
    ).rejects.toThrow(/Invalid experiment transition/);

    expect(() =>
      assertValidTransition(
        ExperimentStatus.DRAFT,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/Invalid experiment transition: DRAFT → RUNNING/);

    expect(() =>
      assertValidTransition(
        ExperimentStatus.AWAITING_APPROVAL,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/AWAITING_APPROVAL → RUNNING/);
  });
});
