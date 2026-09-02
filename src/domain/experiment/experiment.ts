import { ExperimentStatus, type Experiment, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  selectSimulationWorld,
} from "@/domain/simulation/world-selection";
import { runSimulationForExperiment } from "@/domain/simulation/run";
import { persistAnalysisForExperiment } from "@/domain/persistence/scientific-store";
import { recordExperimentEvent } from "@/domain/persistence/event-store";

import { isSupportedFactor } from "./factors";
import {
  ExperimentDomainError,
  invalidStatusError,
} from "./errors";
import {
  assertExperimentCanExecute,
  assertValidTransition,
} from "./state-machine";
import type {
  ApproveExperimentInput,
  CreateExperimentInput,
  ExperimentIdInput,
  RejectExperimentInput,
} from "./types";

function validateCreateInput(input: CreateExperimentInput): void {
  if (!input.question.trim()) {
    throw new ExperimentDomainError(
      "Experiment question is required",
      "INVALID_INPUT",
    );
  }

  if (!input.hypothesis.trim()) {
    throw new ExperimentDomainError(
      "Experiment hypothesis is required",
      "INVALID_INPUT",
    );
  }

  if (input.factors.length === 0) {
    throw new ExperimentDomainError(
      "At least one plant-growth factor is required",
      "INVALID_INPUT",
    );
  }

  for (const factor of input.factors) {
    if (!isSupportedFactor(factor)) {
      throw new ExperimentDomainError(
        `Unsupported plant-growth factor: ${factor}`,
        "INVALID_FACTOR",
      );
    }

    const levels = input.factorLevels[factor];
    if (!levels || levels.length === 0) {
      throw new ExperimentDomainError(
        `Factor levels are required for ${factor}`,
        "INVALID_FACTOR_LEVELS",
      );
    }

    const unit = input.units[factor];
    if (!unit || !unit.trim()) {
      throw new ExperimentDomainError(
        `Unit is required for ${factor}`,
        "INVALID_UNITS",
      );
    }
  }

  if (input.replicates < 1) {
    throw new ExperimentDomainError(
      "Replicates must be at least 1",
      "INVALID_REPLICATES",
    );
  }

  if (!input.simulationVersion.trim()) {
    throw new ExperimentDomainError(
      "Simulation version is required",
      "INVALID_INPUT",
    );
  }

  if (!input.provenance.source.trim() || !input.provenance.actor.trim()) {
    throw new ExperimentDomainError(
      "Provenance source and actor are required",
      "INVALID_PROVENANCE",
    );
  }
}

async function getExperimentOrThrow(experimentId: string): Promise<Experiment> {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment) {
    throw new ExperimentDomainError(
      `Experiment not found: ${experimentId}`,
      "NOT_FOUND",
    );
  }

  return experiment;
}

function assertStatus(
  experiment: Experiment,
  expected: ExperimentStatus,
  action: string,
): void {
  if (experiment.status !== expected) {
    throw invalidStatusError(expected, experiment.status, action);
  }
}

function transitionUpdate(
  to: ExperimentStatus,
  extra: Prisma.ExperimentUpdateInput = {},
): Prisma.ExperimentUpdateInput {
  const now = new Date();

  switch (to) {
    case ExperimentStatus.AWAITING_APPROVAL:
      return { status: to, submittedAt: now, ...extra };
    case ExperimentStatus.APPROVED:
      return { status: to, approvedAt: now, ...extra };
    case ExperimentStatus.REJECTED:
      return { status: to, rejectedAt: now, ...extra };
    case ExperimentStatus.RUNNING:
      return { status: to, startedAt: now, ...extra };
    case ExperimentStatus.COMPLETED:
      return { status: to, completedAt: now, ...extra };
    case ExperimentStatus.ANALYZED:
      return { status: to, analyzedAt: now, ...extra };
    case ExperimentStatus.REPLICATED:
      return { status: to, replicatedAt: now, ...extra };
    default:
      return { status: to, ...extra };
  }
}

async function resolveSimulationWorldKey(
  input: CreateExperimentInput,
): Promise<{ simulationWorldKey: string; parentExperimentId: string | null }> {
  if (input.provenance.parentExperimentId) {
    const parent = await db.experiment.findUnique({
      where: { id: input.provenance.parentExperimentId },
      select: { id: true, simulationWorldKey: true },
    });

    if (!parent) {
      throw new ExperimentDomainError(
        `Parent experiment not found: ${input.provenance.parentExperimentId}`,
        "PARENT_NOT_FOUND",
      );
    }

    return {
      simulationWorldKey: parent.simulationWorldKey,
      parentExperimentId: parent.id,
    };
  }

  return {
    simulationWorldKey: selectSimulationWorld({
      simulationVersion: input.simulationVersion.trim(),
      familyKey: `${input.provenance.source}:${input.provenance.actor}`,
    }),
    parentExperimentId: null,
  };
}

export async function createExperiment(
  input: CreateExperimentInput,
): Promise<Experiment> {
  validateCreateInput(input);

  const { simulationWorldKey, parentExperimentId } =
    await resolveSimulationWorldKey(input);

  const experiment = await db.experiment.create({
    data: {
      question: input.question.trim(),
      hypothesis: input.hypothesis.trim(),
      factors: input.factors,
      factorLevels: input.factorLevels,
      units: input.units,
      replicates: input.replicates,
      seed: input.seed | 0,
      simulationVersion: input.simulationVersion.trim(),
      simulationWorldKey,
      parentExperimentId,
      provenance: input.provenance,
      status: ExperimentStatus.DRAFT,
    },
  });

  await recordExperimentEvent({
    experimentId: experiment.id,
    type: "experiment_created",
    metadata: {
      seed: experiment.seed,
      simulationVersion: experiment.simulationVersion,
      status: experiment.status,
      parentExperimentId: experiment.parentExperimentId,
      factors: experiment.factors,
      replicates: experiment.replicates,
    },
  });

  return experiment;
}

export async function getExperimentLineage(experimentId: string) {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    include: {
      parentExperiment: true,
      childExperiments: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!experiment) {
    throw new ExperimentDomainError(
      `Experiment not found: ${experimentId}`,
      "NOT_FOUND",
    );
  }

  return experiment;
}

export async function submitExperimentForApproval(
  input: ExperimentIdInput,
): Promise<Experiment> {
  const experiment = await getExperimentOrThrow(input.experimentId);
  assertValidTransition(
    experiment.status,
    ExperimentStatus.AWAITING_APPROVAL,
  );

  const updated = await db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.AWAITING_APPROVAL),
  });

  await recordExperimentEvent({
    experimentId: updated.id,
    type: "approval_requested",
    metadata: {
      fromStatus: experiment.status,
      toStatus: updated.status,
      submittedAt: updated.submittedAt,
    },
  });

  return updated;
}

export async function approveExperiment(
  input: ApproveExperimentInput,
): Promise<Experiment> {
  if (!input.approvalRationale.trim()) {
    throw new ExperimentDomainError(
      "Approval rationale is required for human approval",
      "MISSING_APPROVAL_RATIONALE",
    );
  }

  const experiment = await getExperimentOrThrow(input.experimentId);
  assertStatus(experiment, ExperimentStatus.AWAITING_APPROVAL, "approve");

  assertValidTransition(experiment.status, ExperimentStatus.APPROVED);

  const updated = await db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.APPROVED, {
      approvalRationale: input.approvalRationale.trim(),
      rejectionRationale: null,
    }),
  });

  await recordExperimentEvent({
    experimentId: updated.id,
    type: "approval_granted",
    metadata: {
      fromStatus: experiment.status,
      toStatus: updated.status,
      approvalRationale: updated.approvalRationale,
      approvedAt: updated.approvedAt,
    },
  });

  return updated;
}

export async function rejectExperiment(
  input: RejectExperimentInput,
): Promise<Experiment> {
  if (!input.rejectionRationale.trim()) {
    throw new ExperimentDomainError(
      "Rejection rationale is required",
      "MISSING_REJECTION_RATIONALE",
    );
  }

  const experiment = await getExperimentOrThrow(input.experimentId);
  assertStatus(experiment, ExperimentStatus.AWAITING_APPROVAL, "reject");

  assertValidTransition(experiment.status, ExperimentStatus.REJECTED);

  const updated = await db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.REJECTED, {
      rejectionRationale: input.rejectionRationale.trim(),
    }),
  });

  await recordExperimentEvent({
    experimentId: updated.id,
    type: "experiment_rejected",
    metadata: {
      fromStatus: experiment.status,
      toStatus: updated.status,
      rejectionRationale: updated.rejectionRationale,
      rejectedAt: updated.rejectedAt,
    },
  });

  return updated;
}

export async function startExperiment(
  input: ExperimentIdInput,
): Promise<Experiment> {
  const experiment = await getExperimentOrThrow(input.experimentId);

  assertExperimentCanExecute(experiment.status);
  assertValidTransition(experiment.status, ExperimentStatus.RUNNING);

  const running = await db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.RUNNING),
  });

  await runSimulationForExperiment({ experimentId: running.id });

  await recordExperimentEvent({
    experimentId: running.id,
    type: "experiment_started",
    metadata: {
      fromStatus: experiment.status,
      toStatus: running.status,
      seed: running.seed,
      simulationVersion: running.simulationVersion,
      startedAt: running.startedAt,
    },
  });

  return running;
}

export async function completeExperiment(
  input: ExperimentIdInput,
): Promise<Experiment> {
  const experiment = await getExperimentOrThrow(input.experimentId);
  assertStatus(experiment, ExperimentStatus.RUNNING, "complete");

  assertValidTransition(experiment.status, ExperimentStatus.COMPLETED);

  const observationCount = await db.simulationObservation.count({
    where: { experimentId: experiment.id },
  });

  if (observationCount === 0) {
    throw new ExperimentDomainError(
      "Cannot complete experiment without persisted observations",
      "MISSING_OBSERVATIONS",
    );
  }

  const completed = await db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.COMPLETED),
  });

  await recordExperimentEvent({
    experimentId: completed.id,
    type: "experiment_completed",
    metadata: {
      fromStatus: experiment.status,
      toStatus: completed.status,
      observationCount,
      completedAt: completed.completedAt,
    },
  });

  return completed;
}

export async function markAnalyzed(
  input: ExperimentIdInput,
): Promise<Experiment> {
  const experiment = await getExperimentOrThrow(input.experimentId);
  assertStatus(experiment, ExperimentStatus.COMPLETED, "mark as analyzed");

  assertValidTransition(experiment.status, ExperimentStatus.ANALYZED);

  const { analysis } = await persistAnalysisForExperiment(experiment.id);

  const analyzed = await db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.ANALYZED),
  });

  await recordExperimentEvent({
    experimentId: analyzed.id,
    type: "analysis_completed",
    metadata: {
      fromStatus: experiment.status,
      toStatus: analyzed.status,
      analyzedAt: analyzed.analyzedAt,
      analysisId: analysis.id,
      analysisVersion: analysis.analysisVersion,
      seed: analyzed.seed,
      simulationVersion: analyzed.simulationVersion,
    },
  });

  return analyzed;
}

export async function markReplicated(
  input: ExperimentIdInput,
): Promise<Experiment> {
  const experiment = await getExperimentOrThrow(input.experimentId);
  assertStatus(experiment, ExperimentStatus.ANALYZED, "mark as replicated");

  assertValidTransition(experiment.status, ExperimentStatus.REPLICATED);

  const successfulReplication = await db.replication.findFirst({
    where: {
      originalExperimentId: experiment.id,
      replicationSuccess: true,
    },
  });

  if (!successfulReplication) {
    throw new ExperimentDomainError(
      "Cannot mark experiment as replicated without a persisted successful replication record",
      "REPLICATION_NOT_VERIFIED",
    );
  }

  return db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.REPLICATED),
  });
}

export async function reviseRejectedExperiment(
  input: ExperimentIdInput,
): Promise<Experiment> {
  const experiment = await getExperimentOrThrow(input.experimentId);
  assertStatus(experiment, ExperimentStatus.REJECTED, "revise");

  assertValidTransition(experiment.status, ExperimentStatus.DRAFT);

  return db.experiment.update({
    where: { id: experiment.id },
    data: transitionUpdate(ExperimentStatus.DRAFT, {
      rejectionRationale: null,
    }),
  });
}
