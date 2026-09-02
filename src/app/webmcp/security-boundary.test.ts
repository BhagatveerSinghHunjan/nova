import { ExperimentStatus, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpCreateExperimentAction,
  webmcpRunExperimentAction,
} from "@/app/webmcp/actions";
import {
  approveExperiment,
  assertValidTransition,
  rejectExperiment,
  reviseRejectedExperiment,
  startExperiment,
} from "@/domain/experiment";
import { parseWebMcpFactors } from "@/app/webmcp/factor-input";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeSecurity = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-14-security-audit";

describeSecurity("LEVEL 8.14 security + state-machine boundary", () => {
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

  it("A. create_experiment → AWAITING_APPROVAL (not auto-approved/run)", async () => {
    const bypassAttempt = {
      question: "LEVEL 8.14 create boundary",
      hypothesis: "Stays awaiting approval.",
      factors: ["temperature", "water"],
      factor_levels: { temperature: [20, 25], water: [0.5, 1] },
      units: { temperature: "celsius", water: "relative" },
      replicates: 2,
      seed: 94_001,
      simulation_version: "nova-sim-v1",
      provenance: { source: "nova-lab-tests", actor: ACTOR },
      status: "APPROVED",
      approved: true,
    };

    const result = await webmcpCreateExperimentAction(
      bypassAttempt as Parameters<typeof webmcpCreateExperimentAction>[0],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
    expect(result.data.approval_required).toBe(true);

    const persisted = await db.experiment.findUniqueOrThrow({
      where: { id: result.data.experiment_id },
    });
    expect(persisted.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
    expect(persisted.approvedAt).toBeNull();
    expect(
      await db.simulationObservation.count({
        where: { experimentId: persisted.id },
      }),
    ).toBe(0);
  });

  it("B. run before approval → HUMAN_APPROVAL_REQUIRED with experiment_id", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.14 run before approval",
      hypothesis: "Must fail.",
      factors: ["temperature", "water"],
      factor_levels: { temperature: [20, 25], water: [0.5, 1] },
      units: { temperature: "celsius", water: "relative" },
      replicates: 2,
      seed: 94_002,
      simulation_version: "nova-sim-v1",
      provenance: { source: "nova-lab-tests", actor: ACTOR },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });

    expect(ran.ok).toBe(false);
    if (ran.ok) {
      return;
    }
    expect(ran.error.code).toBe("HUMAN_APPROVAL_REQUIRED");
    expect(ran.error.experiment_id).toBe(created.data.experiment_id);

    const persisted = await db.experiment.findUniqueOrThrow({
      where: { id: created.data.experiment_id },
    });
    expect(persisted.status).toBe(ExperimentStatus.AWAITING_APPROVAL);
  });

  it("C–D. approve → APPROVED; run after approval succeeds", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.14 approve then run",
      hypothesis: "Human approval authorizes execution.",
      factors: ["temperature", "water"],
      factor_levels: { temperature: [20, 25], water: [0.5, 1] },
      units: { temperature: "celsius", water: "relative" },
      replicates: 2,
      seed: 94_003,
      simulation_version: "nova-sim-v1",
      provenance: { source: "nova-lab-tests", actor: ACTOR },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const approved = await approveExperiment({
      experimentId: created.data.experiment_id,
      approvalRationale: "Human approval for LEVEL 8.14 security audit.",
    });
    expect(approved.status).toBe(ExperimentStatus.APPROVED);

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });
    expect(ran.ok).toBe(true);
    if (!ran.ok) {
      return;
    }
    expect(ran.data.status).toBe(ExperimentStatus.COMPLETED);
    expect(ran.data.observation_count).toBeGreaterThan(0);
  });

  it("E. invalid state transitions are rejected server-side", () => {
    expect(() =>
      assertValidTransition(
        ExperimentStatus.DRAFT,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/DRAFT → RUNNING/);
    expect(() =>
      assertValidTransition(
        ExperimentStatus.AWAITING_APPROVAL,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/AWAITING_APPROVAL → RUNNING/);
    expect(() =>
      assertValidTransition(
        ExperimentStatus.REJECTED,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/REJECTED → RUNNING/);
    expect(() =>
      assertValidTransition(
        ExperimentStatus.COMPLETED,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/COMPLETED → RUNNING/);
    expect(() =>
      assertValidTransition(
        ExperimentStatus.COMPLETED,
        ExperimentStatus.APPROVED,
      ),
    ).toThrow(/COMPLETED → APPROVED/);
    expect(() =>
      assertValidTransition(
        ExperimentStatus.ANALYZED,
        ExperimentStatus.RUNNING,
      ),
    ).toThrow(/ANALYZED → RUNNING/);
  });

  it("F. unsupported factors are rejected", () => {
    expect(() => parseWebMcpFactors(["pressure"])).toThrow(/Unsupported/);
  });

  it("G. WebMCP cannot bypass approval; rejection blocks run; revise returns to DRAFT", async () => {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.14 rejection path",
      hypothesis: "Rejected experiments cannot run.",
      factors: ["temperature", "water"],
      factor_levels: { temperature: [20, 25], water: [0.5, 1] },
      units: { temperature: "celsius", water: "relative" },
      replicates: 2,
      seed: 94_004,
      simulation_version: "nova-sim-v1",
      provenance: { source: "nova-lab-tests", actor: ACTOR },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const rejected = await rejectExperiment({
      experimentId: created.data.experiment_id,
      rejectionRationale: "Unsafe design for LEVEL 8.14 audit.",
    });
    expect(rejected.status).toBe(ExperimentStatus.REJECTED);
    expect(rejected.rejectionRationale).toContain("Unsafe design");

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });
    expect(ran.ok).toBe(false);
    if (!ran.ok) {
      expect(ran.error.code).toBe("HUMAN_APPROVAL_REQUIRED");
    }

    await expect(
      startExperiment({ experimentId: created.data.experiment_id }),
    ).rejects.toThrow(/REJECTED → RUNNING/);

    const revised = await reviseRejectedExperiment({
      experimentId: created.data.experiment_id,
    });
    expect(revised.status).toBe(ExperimentStatus.DRAFT);
  });
});
