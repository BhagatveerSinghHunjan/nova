import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  webmcpAnalyzeResultsAction,
  webmcpCreateExperimentAction,
  webmcpRunExperimentAction,
  webmcpSaveFindingAction,
} from "@/app/webmcp/actions";
import { approveExperiment } from "@/domain/experiment";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeSaveFinding = hasDatabase ? describe : describe.skip;
const ACTOR = "level8-9-webmcp-save-finding";

describeSaveFinding("WebMCP save_finding server bridge", () => {
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

  async function createAnalyzedExperiment(seed: number) {
    const created = await webmcpCreateExperimentAction({
      question: "LEVEL 8.9 save_finding provenance",
      hypothesis: "Findings must link to matching analysis evidence.",
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
      approvalRationale: "Approved for LEVEL 8.9 save_finding tests.",
    });

    const ran = await webmcpRunExperimentAction({
      experiment_id: created.data.experiment_id,
    });
    expect(ran.ok).toBe(true);
    if (!ran.ok) {
      throw new Error(ran.error.message);
    }

    const analyzed = await webmcpAnalyzeResultsAction({
      experiment_id: created.data.experiment_id,
    });
    expect(analyzed.ok).toBe(true);
    if (!analyzed.ok) {
      throw new Error(analyzed.error.message);
    }

    return analyzed.data;
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

  it("persists an agent-authored finding with provenance and finding_saved", async () => {
    const analyzed = await createAnalyzedExperiment(89_001);
    const findingText =
      "Temperature and water jointly influence synthetic biomass in this design.";

    const result = await webmcpSaveFindingAction({
      experiment_id: analyzed.experiment_id,
      analysis_id: analyzed.analysis_id,
      finding_text: findingText,
      confidence: 0.82,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.finding_id).toBeTruthy();
    expect(result.data.experiment_id).toBe(analyzed.experiment_id);
    expect(result.data.analysis_id).toBe(analyzed.analysis_id);
    expect(result.data.finding).toBe(findingText);
    expect(result.data.finding_text).toBe(findingText);
    expect(result.data.confidence).toBe(0.82);
    expect(result.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.data.evidence_chain).toBe(
      "Finding → Analysis → Experiment → Observations",
    );
    expect(result.data.provenance.observation_count).toBeGreaterThan(0);

    const persisted = await db.finding.findUniqueOrThrow({
      where: { id: result.data.finding_id },
    });
    expect(persisted.experimentId).toBe(analyzed.experiment_id);
    expect(persisted.analysisId).toBe(analyzed.analysis_id);
    expect(persisted.findingText).toBe(findingText);

    const events = await db.experimentEvent.findMany({
      where: {
        experimentId: analyzed.experiment_id,
        type: "finding_saved",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.metadata).toMatchObject({
      findingId: result.data.finding_id,
      analysisId: analyzed.analysis_id,
      confidence: 0.82,
    });
  });

  it("rejects a finding that references an unrelated analysis", async () => {
    const primary = await createAnalyzedExperiment(89_002);
    const other = await createAnalyzedExperiment(89_003);

    const result = await webmcpSaveFindingAction({
      experiment_id: primary.experiment_id,
      analysis_id: other.analysis_id,
      finding_text: "This should fail provenance checks.",
      confidence: 0.5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVENANCE_MISMATCH");

    const findings = await db.finding.count({
      where: { experimentId: primary.experiment_id },
    });
    expect(findings).toBe(0);
  });

  it("returns NOT_FOUND when the experiment does not exist", async () => {
    const result = await webmcpSaveFindingAction({
      experiment_id: "00000000-0000-4000-8000-000000000089",
      analysis_id: "00000000-0000-4000-8000-000000000088",
      finding_text: "Missing experiment",
      confidence: 0.4,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns ANALYSIS_NOT_FOUND when analysis is missing", async () => {
    const analyzed = await createAnalyzedExperiment(89_004);

    const result = await webmcpSaveFindingAction({
      experiment_id: analyzed.experiment_id,
      analysis_id: "00000000-0000-4000-8000-000000000087",
      finding_text: "Missing analysis",
      confidence: 0.4,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ANALYSIS_NOT_FOUND");
  });

  it("does not invent a finding when finding_text is empty", async () => {
    const analyzed = await createAnalyzedExperiment(89_005);

    const result = await webmcpSaveFindingAction({
      experiment_id: analyzed.experiment_id,
      analysis_id: analyzed.analysis_id,
      finding_text: "   ",
      confidence: 0.7,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_FINDING");
  });
});
