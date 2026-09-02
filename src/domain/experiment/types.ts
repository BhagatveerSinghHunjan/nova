import type { Experiment, ExperimentStatus, PlantGrowthFactor } from "@prisma/client";

export type { Experiment, ExperimentStatus, PlantGrowthFactor };

export type FactorLevels = Partial<Record<PlantGrowthFactor, number[]>>;

export type FactorUnits = Partial<Record<PlantGrowthFactor, string>>;

export type ExperimentProvenance = {
  source: string;
  actor: string;
  parentExperimentId?: string;
  notes?: string;
};

export type CreateExperimentInput = {
  question: string;
  hypothesis: string;
  factors: PlantGrowthFactor[];
  factorLevels: FactorLevels;
  units: FactorUnits;
  replicates: number;
  seed: number;
  simulationVersion: string;
  provenance: ExperimentProvenance;
};

export type ApproveExperimentInput = {
  experimentId: string;
  approvalRationale: string;
};

export type RejectExperimentInput = {
  experimentId: string;
  rejectionRationale: string;
};

export type ExperimentIdInput = {
  experimentId: string;
};
