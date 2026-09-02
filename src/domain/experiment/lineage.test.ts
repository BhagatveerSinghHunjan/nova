import { PlantGrowthFactor, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createExperiment,
  getExperimentLineage,
} from "@/domain/experiment";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeLineage = hasDatabase ? describe : describe.skip;

describeLineage("LEVEL 6.7 experiment lineage", () => {
  const db = new PrismaClient();
  const preservedIds: string[] = [];

  const baseInput = {
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
    replicates: 2,
    seed: 81_001,
    simulationVersion: "nova-sim-v1",
    provenance: {
      source: "nova-lab-tests",
      actor: "level6-7-lineage",
    },
  };

  beforeAll(async () => {
    await db.$connect();
    const existing = await db.experiment.findMany({ select: { id: true } });
    preservedIds.push(...existing.map((row) => row.id));
  });

  afterAll(async () => {
    await db.experiment.deleteMany({
      where: {
        parentExperimentId: { not: null },
        provenance: {
          path: ["actor"],
          equals: "level6-7-lineage",
        },
      },
    });
    await db.experiment.deleteMany({
      where: {
        provenance: {
          path: ["actor"],
          equals: "level6-7-lineage",
        },
      },
    });
    await db.$disconnect();
  });

  it("1. root experiment has null parentExperimentId", async () => {
    const root = await createExperiment(baseInput);
    expect(root.parentExperimentId).toBeNull();

    const loaded = await db.experiment.findUniqueOrThrow({
      where: { id: root.id },
    });
    expect(loaded.parentExperimentId).toBeNull();
  });

  it("2. follow-up experiment correctly references its parent", async () => {
    const parent = await createExperiment({
      ...baseInput,
      seed: 81_002,
    });

    const child = await createExperiment({
      ...baseInput,
      seed: 81_003,
      provenance: {
        ...baseInput.provenance,
        parentExperimentId: parent.id,
        notes: "Follow-up under parent lineage",
      },
    });

    expect(child.parentExperimentId).toBe(parent.id);
    expect(
      (child.provenance as { parentExperimentId?: string }).parentExperimentId,
    ).toBe(parent.id);
  });

  it("3. parent can retrieve child experiments", async () => {
    const parent = await createExperiment({
      ...baseInput,
      seed: 81_004,
    });

    const child = await createExperiment({
      ...baseInput,
      seed: 81_005,
      provenance: {
        ...baseInput.provenance,
        parentExperimentId: parent.id,
      },
    });

    const lineage = await getExperimentLineage(parent.id);
    expect(lineage.childExperiments.map((item) => item.id)).toContain(child.id);
  });

  it("4. child can retrieve its parent", async () => {
    const parent = await createExperiment({
      ...baseInput,
      seed: 81_006,
    });

    const child = await createExperiment({
      ...baseInput,
      seed: 81_007,
      provenance: {
        ...baseInput.provenance,
        parentExperimentId: parent.id,
      },
    });

    const lineage = await getExperimentLineage(child.id);
    expect(lineage.parentExperiment?.id).toBe(parent.id);
  });

  it("5. existing experiments remain intact", async () => {
    for (const id of preservedIds) {
      const existing = await db.experiment.findUnique({ where: { id } });
      expect(existing).not.toBeNull();
    }

    expect(await db.experiment.count()).toBeGreaterThanOrEqual(
      preservedIds.length,
    );
  });

  it("6. existing provenance data remains intact", async () => {
    for (const id of preservedIds) {
      const existing = await db.experiment.findUniqueOrThrow({
        where: { id },
      });
      expect(existing.provenance).toBeTruthy();
      expect(typeof existing.provenance).toBe("object");
    }

    const existingWithoutJsonParent = preservedIds.length
      ? await db.experiment.findMany({
          where: { id: { in: preservedIds } },
        })
      : [];

    for (const experiment of existingWithoutJsonParent) {
      const provenance = experiment.provenance as {
        parentExperimentId?: string;
      };
      if (!provenance.parentExperimentId) {
        expect(experiment.parentExperimentId).toBeNull();
      }
    }
  });
});
