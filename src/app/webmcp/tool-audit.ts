import { randomUUID } from "node:crypto";

import { recordExperimentEvent } from "@/domain/persistence";
import { db } from "@/lib/db";

/**
 * Persists tool_call_* audit events for WebMCP server-bridge invocations.
 *
 * These events mean the NOVA WebMCP server action ran—not cryptographic proof
 * that a browser agent used document.modelContext.
 */

export type WebMcpToolName =
  | "create_experiment"
  | "run_experiment"
  | "get_results"
  | "analyze_results"
  | "save_finding"
  | "replicate_experiment";

type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

type ToolAuditError = {
  code: string;
  message: string;
};

function safeError(error: ToolAuditError | undefined): ToolAuditError | undefined {
  if (!error) {
    return undefined;
  }

  return {
    code: error.code,
    message: error.message.slice(0, 500),
  };
}

function sanitizeEntityIds(
  entityIds?: Record<string, string | number | boolean | null | undefined>,
) {
  if (!entityIds) {
    return {};
  }

  const allowed = [
    "experiment_id",
    "analysis_id",
    "finding_id",
    "replication_id",
    "replication_experiment_id",
    "original_experiment_id",
    "observation_count",
    "status",
    "replication_success",
  ] as const;

  const cleaned: Record<string, string | number | boolean | null> = {};
  for (const key of allowed) {
    const value = entityIds[key];
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export function newToolInvocationId() {
  return randomUUID();
}

export async function recordToolCallStarted(input: {
  experimentId: string;
  toolName: WebMcpToolName;
  invocationId: string;
  entityIds?: Record<string, string | number | boolean | null | undefined>;
}) {
  const timestamp = new Date().toISOString();

  await recordExperimentEvent({
    experimentId: input.experimentId,
    type: "tool_call_started",
    metadata: {
      toolName: input.toolName,
      invocationId: input.invocationId,
      experiment_id: input.experimentId,
      timestamp,
      ...sanitizeEntityIds(input.entityIds),
    },
  });
}

export async function recordToolCallCompleted(input: {
  experimentId: string;
  toolName: WebMcpToolName;
  invocationId: string;
  success: boolean;
  error?: ToolAuditError;
  entityIds?: Record<string, string | number | boolean | null | undefined>;
}) {
  const timestamp = new Date().toISOString();

  await recordExperimentEvent({
    experimentId: input.experimentId,
    type: "tool_call_completed",
    metadata: {
      toolName: input.toolName,
      invocationId: input.invocationId,
      experiment_id: input.experimentId,
      success: input.success,
      timestamp,
      ...(input.error ? { error: safeError(input.error) } : {}),
      ...sanitizeEntityIds(input.entityIds),
    },
  });
}

/**
 * Runs an operation for a known experiment_id:
 * tool_call_started → domain operation → tool_call_completed
 */
export async function withExperimentToolAudit<T>(input: {
  toolName: WebMcpToolName;
  experimentId: string;
  entityIds?: Record<string, string | number | boolean | null | undefined>;
  operation: () => Promise<ToolResult<T>>;
  completedEntityIds?: (
    result: ToolResult<T>,
  ) => Record<string, string | number | boolean | null | undefined> | undefined;
}): Promise<ToolResult<T>> {
  const exists = await db.experiment.findUnique({
    where: { id: input.experimentId },
    select: { id: true },
  });

  if (!exists) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `Experiment not found: ${input.experimentId}`,
      },
    };
  }

  const invocationId = newToolInvocationId();

  await recordToolCallStarted({
    experimentId: input.experimentId,
    toolName: input.toolName,
    invocationId,
    entityIds: input.entityIds,
  });

  const result = await input.operation();

  await recordToolCallCompleted({
    experimentId: input.experimentId,
    toolName: input.toolName,
    invocationId,
    success: result.ok,
    error: result.ok ? undefined : result.error,
    entityIds: {
      ...input.entityIds,
      ...input.completedEntityIds?.(result),
    },
  });

  return result;
}
