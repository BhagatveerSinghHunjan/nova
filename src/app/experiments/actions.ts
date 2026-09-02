"use server";

import { revalidatePath } from "next/cache";

import {
  approveExperiment,
  completeExperiment,
  markAnalyzed,
  rejectExperiment,
  startExperiment,
  submitExperimentForApproval,
} from "@/domain/experiment";
import { createFinding } from "@/domain/persistence";

export type ActionResult = {
  ok: boolean;
  error?: string;
};

function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  return { ok: false, error: message };
}

function revalidateExperiment(experimentId: string) {
  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath("/experiments");
}

export async function submitForApprovalAction(
  experimentId: string,
): Promise<ActionResult> {
  try {
    await submitExperimentForApproval({ experimentId });
    revalidateExperiment(experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function approveExperimentAction(
  experimentId: string,
  approvalRationale: string,
): Promise<ActionResult> {
  try {
    await approveExperiment({
      experimentId,
      approvalRationale,
    });
    revalidateExperiment(experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectExperimentAction(
  experimentId: string,
  rejectionRationale: string,
): Promise<ActionResult> {
  try {
    await rejectExperiment({
      experimentId,
      rejectionRationale,
    });
    revalidateExperiment(experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function startExperimentAction(
  experimentId: string,
): Promise<ActionResult> {
  try {
    await startExperiment({ experimentId });
    revalidateExperiment(experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function completeExperimentAction(
  experimentId: string,
): Promise<ActionResult> {
  try {
    await completeExperiment({ experimentId });
    revalidateExperiment(experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function analyzeExperimentAction(
  experimentId: string,
): Promise<ActionResult> {
  try {
    await markAnalyzed({ experimentId });
    revalidateExperiment(experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveFindingAction(input: {
  experimentId: string;
  analysisId: string;
  findingText: string;
  confidence: number;
}): Promise<ActionResult> {
  try {
    await createFinding(input);
    revalidateExperiment(input.experimentId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
