/**
 * NOVA WebMCP tools
 * External agents discover these capabilities through document.modelContext
 *
 * Browser registration only. Execute callbacks call existing NOVA server
 * actions → domain validation / state machine / database / events.
 * No Prisma, simulation math, or state-machine logic runs in the browser.
 */

import {
  webmcpAnalyzeResultsAction,
  webmcpCreateExperimentAction,
  webmcpGetResultsAction,
  webmcpReplicateExperimentAction,
  webmcpRunExperimentAction,
  webmcpSaveFindingAction,
} from "@/app/webmcp/actions";

import { NOVA_WEBMCP_TOOLS } from "@/webmcp/tool-definitions";

export type NovaWebMcpRegistrationStatus =
  | "registered"
  | "unavailable"
  | "aborted"
  | "error";

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function requireString(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid string field: ${key}`);
  }
  return value;
}

function requireNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Missing or invalid number field: ${key}`);
  }
  return value;
}

async function executeCreateExperiment(inputObject: Record<string, unknown>) {
  const provenanceRaw = asRecord(inputObject.provenance);
  return webmcpCreateExperimentAction({
    question: requireString(inputObject, "question"),
    hypothesis: requireString(inputObject, "hypothesis"),
    factors: inputObject.factors as string[],
    factor_levels: asRecord(inputObject.factor_levels) as Record<
      string,
      number[]
    >,
    units: asRecord(inputObject.units) as Record<string, string>,
    replicates: requireNumber(inputObject, "replicates"),
    seed: requireNumber(inputObject, "seed"),
    simulation_version: requireString(inputObject, "simulation_version"),
    provenance: {
      source: requireString(provenanceRaw, "source"),
      actor: requireString(provenanceRaw, "actor"),
      notes:
        typeof provenanceRaw.notes === "string"
          ? provenanceRaw.notes
          : undefined,
      parent_experiment_id:
        typeof provenanceRaw.parent_experiment_id === "string"
          ? provenanceRaw.parent_experiment_id
          : undefined,
    },
  });
}

async function executeRunExperiment(inputObject: Record<string, unknown>) {
  return webmcpRunExperimentAction({
    experiment_id: requireString(inputObject, "experiment_id"),
  });
}

async function executeGetResults(inputObject: Record<string, unknown>) {
  return webmcpGetResultsAction({
    experiment_id: requireString(inputObject, "experiment_id"),
  });
}

async function executeAnalyzeResults(inputObject: Record<string, unknown>) {
  return webmcpAnalyzeResultsAction({
    experiment_id: requireString(inputObject, "experiment_id"),
  });
}

async function executeSaveFinding(inputObject: Record<string, unknown>) {
  return webmcpSaveFindingAction({
    experiment_id: requireString(inputObject, "experiment_id"),
    analysis_id: requireString(inputObject, "analysis_id"),
    finding_text: requireString(inputObject, "finding_text"),
    confidence: requireNumber(inputObject, "confidence"),
    replication_id:
      typeof inputObject.replication_id === "string"
        ? inputObject.replication_id
        : undefined,
  });
}

async function executeReplicateExperiment(
  inputObject: Record<string, unknown>,
) {
  return webmcpReplicateExperimentAction({
    original_experiment_id: requireString(
      inputObject,
      "original_experiment_id",
    ),
  });
}

const EXECUTORS: Record<
  (typeof NOVA_WEBMCP_TOOLS)[number]["name"],
  (input: Record<string, unknown>) => Promise<unknown>
> = {
  create_experiment: executeCreateExperiment,
  run_experiment: executeRunExperiment,
  get_results: executeGetResults,
  analyze_results: executeAnalyzeResults,
  save_finding: executeSaveFinding,
  replicate_experiment: executeReplicateExperiment,
};

/**
 * Register the six NOVA tools with the real browser WebMCP Imperative API.
 * Pass an AbortSignal from React effect cleanup to avoid duplicate registrations.
 */
export async function registerNovaWebMcpTools(
  signal: AbortSignal,
): Promise<NovaWebMcpRegistrationStatus> {
  if (typeof document === "undefined") {
    return "unavailable";
  }

  const modelContext = document.modelContext;

  if (!modelContext) {
    if (process.env.NODE_ENV === "development") {
      // Development diagnostic only — not a WebMCP tool and not a polyfill.
      console.info(
        "[NOVA WebMCP] document.modelContext is unavailable in this browser. NOVA UI continues normally; agent tools are not registered.",
      );
    }
    return "unavailable";
  }

  if (signal.aborted) {
    return "aborted";
  }

  try {
    for (const tool of NOVA_WEBMCP_TOOLS) {
      if (signal.aborted) {
        return "aborted";
      }

      const execute = EXECUTORS[tool.name];

      await modelContext.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { ...tool.annotations },
          execute: async (inputObject) => {
            const input = asRecord(inputObject);
            return execute(input);
          },
        },
        { signal },
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.info(
        "[NOVA WebMCP] Registered tools:",
        NOVA_WEBMCP_TOOLS.map((tool) => tool.name).join(", "),
      );
    }

    return "registered";
  } catch (error) {
    if (signal.aborted) {
      return "aborted";
    }

    if (process.env.NODE_ENV === "development") {
      console.warn("[NOVA WebMCP] Registration failed:", error);
    }

    return "error";
  }
}
