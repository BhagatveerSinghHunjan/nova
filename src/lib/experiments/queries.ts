import { db } from "@/lib/db";
import { countFactorCombinations } from "@/domain/simulation/design";
import type { FactorLevels, FactorUnits } from "@/domain/experiment/types";

export async function listExperiments() {
  return db.experiment.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      question: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      replicates: true,
      simulationVersion: true,
    },
  });
}

export async function getExperimentView(experimentId: string) {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    include: {
      observations: {
        orderBy: [{ replicateIndex: "asc" }, { combinationIndex: "asc" }],
      },
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      findings: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      originalReplications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          replicationExperiment: {
            select: {
              id: true,
              question: true,
              seed: true,
              status: true,
              factors: true,
              replicates: true,
              simulationVersion: true,
              createdAt: true,
              updatedAt: true,
              _count: {
                select: { observations: true },
              },
            },
          },
        },
      },
      parentExperiment: {
        select: {
          id: true,
          question: true,
          status: true,
        },
      },
      childExperiments: {
        select: {
          id: true,
          question: true,
          status: true,
        },
        orderBy: { createdAt: "asc" },
      },
      events: {
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { observations: true },
      },
    },
  });

  if (!experiment) {
    return null;
  }

  const factorLevels = experiment.factorLevels as FactorLevels;
  const units = experiment.units as FactorUnits;
  const combinationCount = countFactorCombinations(
    experiment.factors,
    factorLevels,
  );
  const estimatedObservations = combinationCount * experiment.replicates;

  return {
    experiment,
    factorLevels,
    units,
    combinationCount,
    estimatedObservations,
    observationCount: experiment._count.observations,
    analysis: experiment.analyses[0] ?? null,
    finding: experiment.findings[0] ?? null,
    replication: experiment.originalReplications[0] ?? null,
  };
}

export type ExperimentView = NonNullable<
  Awaited<ReturnType<typeof getExperimentView>>
>;
