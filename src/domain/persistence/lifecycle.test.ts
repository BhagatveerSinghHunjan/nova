import { ExperimentStatus, PlantGrowthFactor, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  analyzeFactorialGrowth,
  compareReplicationAnalyses,
} from "@/domain/analysis";
import {
  approveExperiment,
  assertValidTransition,
  completeExperiment,
  createExperiment,
  markAnalyzed,
  markReplicated,
  startExperiment,
  submitExperimentForApproval,
} from "@/domain/experiment";
import {
  createFinding,
  listExperimentEvents,
  loadExperimentObservations,
  persistReplication,
  retrieveExperimentResults,
  traceFindingProvenance,
} from "@/domain/persistence";
import { createReplicationSeed } from "@/domain/simulation";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeLifecycle = hasDatabase ? describe : describe.skip;

const ACTOR = "level6-8-lifecycle";

describeLifecycle("LEVEL 6.8 full persistence lifecycle", () => {
  const db = new PrismaClient();

  const design = {
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
    seed: 68_001,
    simulationVersion: "nova-sim-v1",
    provenance: {
      source: "nova-lab-tests",
      actor: ACTOR,
    },
  };

  async function cleanupOwnedExperiments() {
    const owned = await db.experiment.findMany({
      where: {
        provenance: { path: ["actor"], equals: ACTOR },
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
  }

  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await cleanupOwnedExperiments();
    await db.$disconnect();
  });

  beforeEach(async () => {
    await cleanupOwnedExperiments();
  });

  it("runs the complete domain persistence lifecycle with provenance and events", async () => {
    // 1. Create experiment
    const created = await createExperiment(design);
    expect(created.status).toBe(ExperimentStatus.DRAFT);
    expect(created.seed).toBe(design.seed | 0);
    expect(created.simulationVersion).toBe(design.simulationVersion);
    expect(created.factorLevels).toEqual(design.factorLevels);

    // 2–3. Approval required path
    const awaiting = await submitExperimentForApproval({
      experimentId: created.id,
    });
    expect(awaiting.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
    expect(awaiting.submittedAt).toBeTruthy();

    // 4–5. Approve
    const approved = await approveExperiment({
      experimentId: created.id,
      approvalRationale: "Design approved for Level 6.8 verification.",
    });
    expect(approved.status).toBe(ExperimentStatus.APPROVED);
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.approvalRationale).toContain("Level 6.8");

    // 6–8. Run → observations persisted; then complete
    const running = await startExperiment({ experimentId: created.id });
    expect(running.status).toBe(ExperimentStatus.RUNNING);

    const observations = await db.simulationObservation.findMany({
      where: { experimentId: created.id },
    });
    expect(observations.length).toBeGreaterThan(0);
    expect(
      observations.every((row) => row.simulationVersion === design.simulationVersion),
    ).toBe(true);

    const completed = await completeExperiment({ experimentId: created.id });
    expect(completed.status).toBe(ExperimentStatus.COMPLETED);
    expect(completed.completedAt).toBeTruthy();

    // 9. Retrieve results
    const results = await retrieveExperimentResults(created.id);
    expect(results.length).toBe(observations.length);

    // 10–11. Analyze + persist analysis
    const analyzed = await markAnalyzed({ experimentId: created.id });
    expect(analyzed.status).toBe(ExperimentStatus.ANALYZED);

    const analysis = await db.analysis.findFirstOrThrow({
      where: { experimentId: created.id },
    });
    expect(analysis.analysisVersion).toBe("1.0");
    expect(analysis.seed).toBe(created.seed);
    expect(analysis.simulationVersion).toBe(created.simulationVersion);
    expect(analysis.effects).toBeTruthy();

    // 12–13. Save finding
    const finding = await createFinding({
      experimentId: created.id,
      analysisId: analysis.id,
      findingText: "Temperature and water jointly influence biomass.",
      confidence: 0.88,
    });
    expect(finding.id).toBeTruthy();
    const persistedFinding = await db.finding.findUniqueOrThrow({
      where: { id: finding.id },
    });
    expect(persistedFinding.analysisId).toBe(analysis.id);

    // 14–15. Replication via domain services
    const replicationSeed = createReplicationSeed({
      parentSeed: created.seed,
      simulationVersion: created.simulationVersion,
    });
    expect(replicationSeed).not.toBe(created.seed);

    const replica = await createExperiment({
      ...design,
      seed: replicationSeed,
      provenance: {
        ...design.provenance,
        parentExperimentId: created.id,
        notes: "Independent replication",
      },
    });
    await submitExperimentForApproval({ experimentId: replica.id });
    await approveExperiment({
      experimentId: replica.id,
      approvalRationale: "Replication design approved.",
    });
    await startExperiment({ experimentId: replica.id });
    await completeExperiment({ experimentId: replica.id });
    await markAnalyzed({ experimentId: replica.id });

    const originalObs = await loadExperimentObservations(created.id);
    const replicaObs = await loadExperimentObservations(replica.id);
    expect(replicaObs).not.toEqual(originalObs);

    const expectedComparison = compareReplicationAnalyses({
      original: analyzeFactorialGrowth(originalObs),
      replication: analyzeFactorialGrowth(replicaObs),
    });

    const replication = await persistReplication({
      originalExperimentId: created.id,
      replicationExperimentId: replica.id,
    });

    expect(replication.originalSeed).not.toBe(replication.replicationSeed);
    expect(replication.replicationSuccess).toBe(expectedComparison.replicated);
    expect(replication.sameDirection).toBe(
      expectedComparison.replication_rule.same_direction,
    );
    expect(replication.confidenceIntervalOverlap).toBe(
      expectedComparison.replication_rule.confidence_intervals_overlap,
    );
    expect(replication.analysisVersion).toBe("1.0");
    expect(replication.simulationVersion).toBe(created.simulationVersion);

    if (replication.replicationSuccess) {
      const replicated = await markReplicated({ experimentId: created.id });
      expect(replicated.status).toBe(ExperimentStatus.REPLICATED);
    }

    // 16. Provenance chains
    const provenance = await traceFindingProvenance(finding.id);
    expect(provenance.analysis.id).toBe(analysis.id);
    expect(provenance.experiment.id).toBe(created.id);
    expect(provenance.experiment.observations.length).toBeGreaterThan(0);

    const replicationProvenance = await db.replication.findUniqueOrThrow({
      where: { id: replication.id },
      include: {
        originalExperiment: { include: { observations: true } },
        replicationExperiment: { include: { observations: true } },
      },
    });
    expect(replicationProvenance.originalExperiment.observations.length).toBeGreaterThan(
      0,
    );
    expect(
      replicationProvenance.replicationExperiment.observations.length,
    ).toBeGreaterThan(0);

    // Event history
    const events = await listExperimentEvents(created.id);
    const types = events.map((event) => event.type);
    for (const required of [
      "experiment_created",
      "approval_requested",
      "approval_granted",
      "experiment_started",
      "experiment_completed",
      "results_retrieved",
      "analysis_completed",
      "finding_saved",
      "replication_completed",
    ]) {
      expect(types).toContain(required);
    }

    for (const event of events) {
      expect(event.experimentId).toBe(created.id);
      expect(event.createdAt).toBeInstanceOf(Date);
      expect(event.metadata).toBeTruthy();
      expect(typeof event.metadata).toBe("object");
    }

    const createdEvent = events.find((event) => event.type === "experiment_created");
    expect(createdEvent?.metadata).toMatchObject({
      seed: created.seed,
      simulationVersion: created.simulationVersion,
    });

    const analysisEvent = events.find(
      (event) => event.type === "analysis_completed",
    );
    expect(analysisEvent?.metadata).toMatchObject({
      analysisVersion: "1.0",
      simulationVersion: created.simulationVersion,
    });
  });

  it("rejects running an experiment awaiting approval without changing DB state", async () => {
    const created = await createExperiment({
      ...design,
      seed: 68_101,
    });
    await submitExperimentForApproval({ experimentId: created.id });

    const before = await db.experiment.findUniqueOrThrow({
      where: { id: created.id },
    });
    const observationCountBefore = await db.simulationObservation.count({
      where: { experimentId: created.id },
    });
    const eventCountBefore = await db.experimentEvent.count({
      where: { experimentId: created.id },
    });

    await expect(
      startExperiment({ experimentId: created.id }),
    ).rejects.toThrow(/Invalid experiment transition: AWAITING_APPROVAL → RUNNING/);

    const after = await db.experiment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(
      await db.simulationObservation.count({
        where: { experimentId: created.id },
      }),
    ).toBe(observationCountBefore);
    expect(
      await db.experimentEvent.count({ where: { experimentId: created.id } }),
    ).toBe(eventCountBefore);
  });

  it("keeps invalid state-machine transitions impossible", () => {
    expect(() =>
      assertValidTransition(
        ExperimentStatus.DRAFT,
        ExperimentStatus.COMPLETED,
      ),
    ).toThrow(/DRAFT → COMPLETED/);

    expect(() =>
      assertValidTransition(
        ExperimentStatus.AWAITING_APPROVAL,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/AWAITING_APPROVAL → RUNNING/);

    expect(() =>
      assertValidTransition(
        ExperimentStatus.COMPLETED,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/COMPLETED → RUNNING/);

    expect(() =>
      assertValidTransition(
        ExperimentStatus.ANALYZED,
        ExperimentStatus.APPROVED,
      ),
    ).toThrow(/ANALYZED → APPROVED/);
  });

  it("calculates replication_success from the explicit criterion", async () => {
    const original = await createExperiment({
      ...design,
      seed: 68_201,
    });
    await submitExperimentForApproval({ experimentId: original.id });
    await approveExperiment({
      experimentId: original.id,
      approvalRationale: "Approved for replication criterion check.",
    });
    await startExperiment({ experimentId: original.id });
    await completeExperiment({ experimentId: original.id });

    const replicationSeed = createReplicationSeed({
      parentSeed: original.seed,
      simulationVersion: original.simulationVersion,
    });
    const replica = await createExperiment({
      ...design,
      seed: replicationSeed,
      provenance: {
        ...design.provenance,
        parentExperimentId: original.id,
      },
    });
    await submitExperimentForApproval({ experimentId: replica.id });
    await approveExperiment({
      experimentId: replica.id,
      approvalRationale: "Approved replication.",
    });
    await startExperiment({ experimentId: replica.id });
    await completeExperiment({ experimentId: replica.id });

    const originalObs = await loadExperimentObservations(original.id);
    const replicaObs = await loadExperimentObservations(replica.id);
    expect(original.seed).not.toBe(replica.seed);
    expect(replicaObs).not.toEqual(originalObs);

    const expected = compareReplicationAnalyses({
      original: analyzeFactorialGrowth(originalObs),
      replication: analyzeFactorialGrowth(replicaObs),
    });

    const record = await persistReplication({
      originalExperimentId: original.id,
      replicationExperimentId: replica.id,
    });

    expect(record.replicationSuccess).toBe(expected.replicated);
    expect(record.sameDirection).toBe(expected.replication_rule.same_direction);
    expect(record.confidenceIntervalOverlap).toBe(
      expected.replication_rule.confidence_intervals_overlap,
    );
    expect(
      expected.replication_rule.relative_effect_difference_below_threshold,
    ).toBe(
      expected.comparisons.temperature.criteria
        .relative_effect_difference_below_threshold &&
        expected.comparisons.water.criteria
          .relative_effect_difference_below_threshold &&
        expected.comparisons.temperature_water_interaction.criteria
          .relative_effect_difference_below_threshold,
    );
  });

  it("survives application restart via a new Prisma client", async () => {
    const created = await createExperiment({
      ...design,
      seed: 68_301,
    });

    await db.$disconnect();
    const restarted = new PrismaClient();
    await restarted.$connect();

    const loaded = await restarted.experiment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(loaded.question).toBe(design.question);
    expect(loaded.seed).toBe(created.seed);
    expect(loaded.simulationVersion).toBe(design.simulationVersion);

    const events = await restarted.experimentEvent.findMany({
      where: { experimentId: created.id },
    });
    expect(events.some((event) => event.type === "experiment_created")).toBe(
      true,
    );

    await restarted.$disconnect();
    await db.$connect();
  });
});
