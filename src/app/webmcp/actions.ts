"use server";

import { type Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  approveExperiment,
  completeExperiment,
  createExperiment,
  markAnalyzed,
  markReplicated,
  startExperiment,
  submitExperimentForApproval,
} from "@/domain/experiment";
import type {
  CreateExperimentInput,
  FactorLevels,
  FactorUnits,
} from "@/domain/experiment/types";
import {
  createFinding,
  persistReplication,
  retrieveExperimentResults,
} from "@/domain/persistence";
import {
  countFactorCombinations,
  createReplicationSeed,
} from "@/domain/simulation";
import { db } from "@/lib/db";
import { REPLICATION_RELATIVE_EFFECT_THRESHOLD } from "@/domain/analysis/types";

import {
  parseWebMcpFactorLevels,
  parseWebMcpFactors,
  parseWebMcpUnits,
} from "@/app/webmcp/factor-input";
import {
  newToolInvocationId,
  recordToolCallCompleted,
  recordToolCallStarted,
  withExperimentToolAudit,
} from "@/app/webmcp/tool-audit";

export type WebMcpToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        experiment_id?: string;
        details?: unknown;
      };
    };

function fail(error: unknown): WebMcpToolResult<never> {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return {
      ok: false,
      error: {
        code: (error as { code: string }).code,
        message: (error as { message: string }).message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        error instanceof Error ? error.message : "Unexpected server error",
    },
  };
}

function revalidateExperiment(experimentId: string) {
  try {
    revalidatePath(`/experiments/${experimentId}`);
    revalidatePath("/experiments");
    revalidatePath("/activity");
  } catch {
    // Outside a Next.js request (e.g. unit tests) revalidation is unavailable.
  }
}

/**
 * WebMCP create_experiment → domain create + submit for approval.
 * Does not approve or run. Browser must not call Prisma.
 *
 * tool_call_started is recorded after createExperiment returns an id
 * (events require an experiment FK), then submit runs, then tool_call_completed.
 */
export async function webmcpCreateExperimentAction(input: {
  question: string;
  hypothesis: string;
  factors: string[];
  factor_levels: Record<string, number[]>;
  units: Record<string, string>;
  replicates: number;
  seed: number;
  simulation_version: string;
  provenance: {
    source: string;
    actor: string;
    notes?: string;
    parent_experiment_id?: string;
  };
}): Promise<
  WebMcpToolResult<{
    experiment_id: string;
    status: string;
    estimated_observations: number;
    approval_required: true;
    question: string;
    hypothesis: string;
    factors: string[];
    factor_levels: FactorLevels;
    units: FactorUnits;
    replicates: number;
    seed: number;
    simulation_version: string;
    disclosure: string;
    next_step: string;
  }>
> {
  const invocationId = newToolInvocationId();
  let auditExperimentId: string | null = null;

  try {
    const factors = parseWebMcpFactors(input.factors);
    const factorLevels = parseWebMcpFactorLevels(input.factor_levels);
    const units = parseWebMcpUnits(input.units);

    const payload: CreateExperimentInput = {
      question: input.question,
      hypothesis: input.hypothesis,
      factors,
      factorLevels,
      units,
      replicates: input.replicates,
      seed: input.seed,
      simulationVersion: input.simulation_version,
      provenance: {
        source: input.provenance.source,
        actor: input.provenance.actor,
        notes: input.provenance.notes,
        parentExperimentId: input.provenance.parent_experiment_id,
      },
    };

    const created = await createExperiment(payload);
    auditExperimentId = created.id;

    await recordToolCallStarted({
      experimentId: created.id,
      toolName: "create_experiment",
      invocationId,
      entityIds: { experiment_id: created.id },
    });

    const awaiting = await submitExperimentForApproval({
      experimentId: created.id,
    });

    const estimated_observations =
      countFactorCombinations(awaiting.factors, factorLevels) *
      awaiting.replicates;

    revalidateExperiment(awaiting.id);

    const data = {
      experiment_id: awaiting.id,
      status: awaiting.status,
      estimated_observations,
      approval_required: true as const,
      question: awaiting.question,
      hypothesis: awaiting.hypothesis,
      factors: awaiting.factors,
      factor_levels: awaiting.factorLevels as FactorLevels,
      units: awaiting.units as FactorUnits,
      replicates: awaiting.replicates,
      seed: awaiting.seed,
      simulation_version: awaiting.simulationVersion,
      disclosure:
        "Synthetic experimental data will be generated by a deterministic simulation with stochastic noise after approved execution.",
      next_step:
        "Human approval is required. Call run_experiment only after status is APPROVED.",
    };

    await recordToolCallCompleted({
      experimentId: awaiting.id,
      toolName: "create_experiment",
      invocationId,
      success: true,
      entityIds: {
        experiment_id: awaiting.id,
        status: awaiting.status,
      },
    });

    return { ok: true, data };
  } catch (error) {
    const failed = fail(error);
    if (auditExperimentId && !failed.ok) {
      try {
        await recordToolCallCompleted({
          experimentId: auditExperimentId,
          toolName: "create_experiment",
          invocationId,
          success: false,
          error: failed.error,
          entityIds: { experiment_id: auditExperimentId },
        });
      } catch {
        // Audit must not mask the domain failure.
      }
    }
    return failed;
  }
}

/**
 * Runs an APPROVED experiment via domain start + complete.
 * Approval/authorization is enforced only by the domain state machine.
 */
export async function webmcpRunExperimentAction(input: {
  experiment_id: string;
}): Promise<
  WebMcpToolResult<{
    experiment_id: string;
    status: string;
    observation_count: number;
    seed: number;
    simulation_version: string;
    disclosure: string;
    next_step: string;
  }>
> {
  if (typeof input.experiment_id !== "string" || !input.experiment_id.trim()) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "experiment_id is required",
      },
    };
  }

  const experimentId = input.experiment_id.trim();

  return withExperimentToolAudit({
    toolName: "run_experiment",
    experimentId,
    entityIds: { experiment_id: experimentId },
    operation: async () => {
      try {
        await startExperiment({ experimentId });
        const completed = await completeExperiment({ experimentId });
        const observation_count = await db.simulationObservation.count({
          where: { experimentId: completed.id },
        });

        revalidateExperiment(completed.id);

        return {
          ok: true,
          data: {
            experiment_id: completed.id,
            status: completed.status,
            observation_count,
            seed: completed.seed,
            simulation_version: completed.simulationVersion,
            disclosure:
              "Result from NOVA's synthetic experimental simulation.",
            next_step: "Call get_results and/or analyze_results.",
          },
        };
      } catch (error) {
        const failed = fail(error);
        if (
          !failed.ok &&
          failed.error.code === "INVALID_TRANSITION" &&
          /AWAITING_APPROVAL|DRAFT|REJECTED/.test(failed.error.message)
        ) {
          return {
            ok: false,
            error: {
              code: "HUMAN_APPROVAL_REQUIRED",
              message:
                "Experiment must be APPROVED by a human before run_experiment can execute. The server state machine rejected this run.",
              experiment_id: experimentId,
              details: {
                domain_code: failed.error.code,
                domain_message: failed.error.message,
              },
            },
          };
        }

        return failed;
      }
    },
    completedEntityIds: (result) =>
      result.ok
        ? {
            observation_count: result.data.observation_count,
            status: result.data.status,
          }
        : undefined,
  });
}

/**
 * WebMCP get_results → domain retrieveExperimentResults.
 * Reads persisted observations only; does not re-run the simulator.
 */
export async function webmcpGetResultsAction(input: {
  experiment_id: string;
}): Promise<
  WebMcpToolResult<{
    experiment_id: string;
    observation_count: number;
    disclosure: string;
    observations: Array<{
      data_label: "synthetic";
      simulation_version: string;
      replicate_index: number;
      combination_index: number;
      factor_values: Record<string, number>;
      units: Record<string, string>;
      measured_outcome: {
        biomass: number;
        growth_rate: number;
      };
      biomass: number;
      growth_rate: number;
    }>;
  }>
> {
  if (typeof input.experiment_id !== "string" || !input.experiment_id.trim()) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "experiment_id is required",
      },
    };
  }

  const experimentId = input.experiment_id.trim();

  return withExperimentToolAudit({
    toolName: "get_results",
    experimentId,
    entityIds: { experiment_id: experimentId },
    operation: async () => {
      try {
        const observations = await retrieveExperimentResults(experimentId);

        try {
          revalidatePath("/activity");
        } catch {
          // Outside a Next.js request (e.g. unit tests) revalidation is unavailable.
        }

        return {
          ok: true,
          data: {
            experiment_id: experimentId,
            observation_count: observations.length,
            disclosure: "Result from NOVA's synthetic experimental simulation.",
            observations: observations.map((observation) => ({
              data_label: "synthetic" as const,
              simulation_version: observation.simulationVersion,
              replicate_index: observation.replicateIndex,
              combination_index: observation.combinationIndex,
              factor_values: observation.factorValues as Record<string, number>,
              units: observation.units as Record<string, string>,
              measured_outcome: {
                biomass: observation.biomass,
                growth_rate: observation.growthRate,
              },
              biomass: observation.biomass,
              growth_rate: observation.growthRate,
            })),
          },
        };
      } catch (error) {
        return fail(error);
      }
    },
    completedEntityIds: (result) =>
      result.ok
        ? { observation_count: result.data.observation_count }
        : undefined,
  });
}

/**
 * WebMCP analyze_results → domain markAnalyzed (persistAnalysisForExperiment).
 * Statistics are calculated from persisted observations only.
 */
export async function webmcpAnalyzeResultsAction(input: {
  experiment_id: string;
}): Promise<
  WebMcpToolResult<{
    experiment_id: string;
    analysis_id: string;
    status: string;
    analysis_version: string;
    model: string;
    model_specification: string;
    response_variable: string;
    sample_size: number;
    residual_degrees_of_freedom: number;
    residual_standard_error: number;
    seed: number;
    simulation_version: string;
    factor_effects: {
      temperature: unknown;
      water: unknown;
    };
    interaction_effects: {
      temperature_water_interaction: unknown;
    };
    confidence_intervals: Record<string, unknown>;
    significance_statistics: Record<
      string,
      { t_statistic: unknown; p_value: unknown; standard_error: unknown }
    >;
    effects: unknown;
    disclosure: string;
  }>
> {
  if (typeof input.experiment_id !== "string" || !input.experiment_id.trim()) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "experiment_id is required",
      },
    };
  }

  const experimentId = input.experiment_id.trim();

  return withExperimentToolAudit({
    toolName: "analyze_results",
    experimentId,
    entityIds: { experiment_id: experimentId },
    operation: async () => {
      try {
        const analyzed = await markAnalyzed({ experimentId });
        const analysis = await db.analysis.findFirstOrThrow({
          where: { experimentId: analyzed.id },
          orderBy: { createdAt: "desc" },
        });

        const effects =
          analysis.effects &&
          typeof analysis.effects === "object" &&
          !Array.isArray(analysis.effects)
            ? (analysis.effects as Record<string, Record<string, unknown>>)
            : {};

        const temperature = effects.temperature ?? null;
        const water = effects.water ?? null;
        const interaction = effects.temperature_water_interaction ?? null;

        const confidence_intervals: Record<string, unknown> = {};
        const significance_statistics: Record<
          string,
          { t_statistic: unknown; p_value: unknown; standard_error: unknown }
        > = {};

        for (const [name, effect] of Object.entries(effects)) {
          if (!effect || typeof effect !== "object") {
            continue;
          }
          confidence_intervals[name] = effect.confidence_interval ?? null;
          significance_statistics[name] = {
            t_statistic: effect.t_statistic ?? null,
            p_value: effect.p_value ?? null,
            standard_error: effect.standard_error ?? null,
          };
        }

        revalidateExperiment(analyzed.id);

        return {
          ok: true,
          data: {
            experiment_id: analyzed.id,
            analysis_id: analysis.id,
            status: analyzed.status,
            analysis_version: analysis.analysisVersion,
            model: analysis.model,
            model_specification: analysis.model,
            response_variable: analysis.responseVariable,
            sample_size: analysis.sampleSize,
            residual_degrees_of_freedom: analysis.residualDegreesOfFreedom,
            residual_standard_error: analysis.residualStandardError,
            seed: analysis.seed,
            simulation_version: analysis.simulationVersion,
            factor_effects: {
              temperature,
              water,
            },
            interaction_effects: {
              temperature_water_interaction: interaction,
            },
            confidence_intervals,
            significance_statistics,
            effects: analysis.effects,
            disclosure:
              "Calculated from persisted synthetic observations; not real-world scientific truth.",
          },
        };
      } catch (error) {
        return fail(error);
      }
    },
    completedEntityIds: (result) =>
      result.ok
        ? {
            analysis_id: result.data.analysis_id,
            status: result.data.status,
          }
        : undefined,
  });
}

/**
 * WebMCP save_finding → domain createFinding.
 * Agent supplies the interpretive text; provenance is server-enforced.
 */
export async function webmcpSaveFindingAction(input: {
  experiment_id: string;
  analysis_id: string;
  finding_text: string;
  confidence: number;
  replication_id?: string;
}): Promise<
  WebMcpToolResult<{
    finding_id: string;
    experiment_id: string;
    analysis_id: string;
    finding: string;
    finding_text: string;
    confidence: number;
    timestamp: string;
    replication_id: string | null;
    evidence_chain: string;
    provenance: {
      finding_id: string;
      analysis_id: string;
      experiment_id: string;
      observation_count: number;
    };
  }>
> {
  if (
    typeof input.experiment_id !== "string" ||
    !input.experiment_id.trim()
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "experiment_id is required",
      },
    };
  }

  if (typeof input.analysis_id !== "string" || !input.analysis_id.trim()) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "analysis_id is required",
      },
    };
  }

  if (
    typeof input.finding_text !== "string" ||
    !input.finding_text.trim()
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_FINDING",
        message: "finding_text is required",
      },
    };
  }

  if (typeof input.confidence !== "number" || Number.isNaN(input.confidence)) {
    return {
      ok: false,
      error: {
        code: "INVALID_CONFIDENCE",
        message: "confidence must be a number between 0 and 1",
      },
    };
  }

  const experimentId = input.experiment_id.trim();
  const analysisId = input.analysis_id.trim();

  return withExperimentToolAudit({
    toolName: "save_finding",
    experimentId,
    entityIds: {
      experiment_id: experimentId,
      analysis_id: analysisId,
    },
    operation: async () => {
      try {
        const experiment = await db.experiment.findUniqueOrThrow({
          where: { id: experimentId },
          select: {
            id: true,
            _count: { select: { observations: true } },
          },
        });

        const finding = await createFinding({
          experimentId,
          analysisId,
          findingText: input.finding_text,
          confidence: input.confidence,
          replicationId: input.replication_id,
        });

        revalidateExperiment(finding.experimentId);

        return {
          ok: true,
          data: {
            finding_id: finding.id,
            experiment_id: finding.experimentId,
            analysis_id: finding.analysisId,
            finding: finding.findingText,
            finding_text: finding.findingText,
            confidence: finding.confidence,
            timestamp: finding.createdAt.toISOString(),
            replication_id: finding.replicationId,
            evidence_chain: "Finding → Analysis → Experiment → Observations",
            provenance: {
              finding_id: finding.id,
              analysis_id: finding.analysisId,
              experiment_id: finding.experimentId,
              observation_count: experiment._count.observations,
            },
          },
        };
      } catch (error) {
        return fail(error);
      }
    },
    completedEntityIds: (result) =>
      result.ok
        ? {
            finding_id: result.data.finding_id,
            analysis_id: result.data.analysis_id,
          }
        : { analysis_id: analysisId },
  });
}

/**
 * WebMCP replicate_experiment → existing domain create/run/persistReplication.
 * Creates an independent replica with a new seed, generates observations via
 * the domain lifecycle, then calculates replication_success (not hardcoded).
 *
 * Replica approval uses the domain approveExperiment path with an explicit
 * replication rationale so the state machine is not bypassed.
 */
export async function webmcpReplicateExperimentAction(input: {
  original_experiment_id: string;
}): Promise<
  WebMcpToolResult<{
    original_experiment_id: string;
    replication_experiment_id: string;
    replication_id: string;
    original_seed: number;
    replication_seed: number;
    original_effect: unknown;
    replication_effect: unknown;
    original_confidence_interval: unknown;
    replication_confidence_interval: unknown;
    same_direction: boolean;
    confidence_interval_overlap: boolean;
    relative_effect_difference: number;
    replication_success: boolean;
    relative_effect_difference_threshold: number;
    disclosure: string;
  }>
> {
  if (
    typeof input.original_experiment_id !== "string" ||
    !input.original_experiment_id.trim()
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "original_experiment_id is required",
      },
    };
  }

  const originalId = input.original_experiment_id.trim();

  return withExperimentToolAudit({
    toolName: "replicate_experiment",
    experimentId: originalId,
    entityIds: {
      experiment_id: originalId,
      original_experiment_id: originalId,
    },
    operation: async () => {
      try {
        const original = await db.experiment.findUniqueOrThrow({
          where: { id: originalId },
          include: {
            _count: { select: { observations: true } },
          },
        });

        if (original._count.observations === 0) {
          return {
            ok: false,
            error: {
              code: "MISSING_OBSERVATIONS",
              message:
                "Original experiment must have persisted observations before replication.",
            },
          };
        }

        const replicationSeed = createReplicationSeed({
          parentSeed: original.seed,
          simulationVersion: original.simulationVersion,
        });

        if (replicationSeed === original.seed) {
          return {
            ok: false,
            error: {
              code: "IDENTICAL_SEED",
              message: "Replication seed must differ from the original seed.",
            },
          };
        }

        const provenance = (original.provenance ?? {}) as Prisma.JsonObject;
        const source =
          typeof provenance.source === "string"
            ? provenance.source
            : "nova-lab";
        const actor =
          typeof provenance.actor === "string"
            ? provenance.actor
            : "webmcp-agent";

        const replica = await createExperiment({
          question: original.question,
          hypothesis: original.hypothesis,
          factors: original.factors,
          factorLevels: original.factorLevels as FactorLevels,
          units: original.units as FactorUnits,
          replicates: original.replicates,
          seed: replicationSeed,
          simulationVersion: original.simulationVersion,
          provenance: {
            source,
            actor,
            parentExperimentId: original.id,
            notes: "Independent replication via WebMCP replicate_experiment",
          },
        });

        await submitExperimentForApproval({ experimentId: replica.id });
        await approveExperiment({
          experimentId: replica.id,
          approvalRationale: `Replication of human-approved parent experiment ${original.id}: same design, independent seed; approved through domain state machine for synthetic replication run.`,
        });
        await startExperiment({ experimentId: replica.id });
        await completeExperiment({ experimentId: replica.id });

        const record = await persistReplication({
          originalExperimentId: original.id,
          replicationExperimentId: replica.id,
        });

        if (record.replicationSuccess) {
          try {
            await markReplicated({ experimentId: original.id });
          } catch {
            // Original may not be ANALYZED yet; replication record still persists.
          }
        }

        revalidateExperiment(original.id);
        revalidateExperiment(replica.id);

        return {
          ok: true,
          data: {
            original_experiment_id: record.originalExperimentId,
            replication_experiment_id: record.replicationExperimentId,
            replication_id: record.id,
            original_seed: record.originalSeed,
            replication_seed: record.replicationSeed,
            original_effect: record.originalEffect,
            replication_effect: record.replicationEffect,
            original_confidence_interval: record.originalConfidenceInterval,
            replication_confidence_interval:
              record.replicationConfidenceInterval,
            same_direction: record.sameDirection,
            confidence_interval_overlap: record.confidenceIntervalOverlap,
            relative_effect_difference: record.relativeEffectDifference,
            replication_success: record.replicationSuccess,
            relative_effect_difference_threshold:
              REPLICATION_RELATIVE_EFFECT_THRESHOLD,
            disclosure:
              "Replication_success is calculated from same direction AND CI overlap AND relative effect difference < 20%. Synthetic data only.",
          },
        };
      } catch (error) {
        return fail(error);
      }
    },
    completedEntityIds: (result) =>
      result.ok
        ? {
            original_experiment_id: result.data.original_experiment_id,
            replication_experiment_id: result.data.replication_experiment_id,
            replication_id: result.data.replication_id,
            replication_success: result.data.replication_success,
          }
        : { original_experiment_id: originalId },
  });
}
