/**
 * NOVA WebMCP tools
 * External agents discover these capabilities through document.modelContext
 *
 * Input schemas and agent-facing descriptions for the Imperative API.
 * Execute handlers live in register-tools.ts and call server actions only.
 */

const FACTOR_ENUM = [
  "temperature",
  "water",
  "light",
  "CO2",
  "nutrients",
  "TEMPERATURE",
  "WATER",
  "LIGHT",
  "NUTRIENTS",
] as const;

export const NOVA_WEBMCP_TOOLS = [
  {
    name: "create_experiment",
    title: "Create plant-growth experiment",
    description:
      "Create a NOVA LAB plant-growth experiment, persist it, and submit it for human approval. Status becomes AWAITING_APPROVAL with approval_required=true. NOVA supports synthetic plant-growth factorial experiments only—not universal science. Supported factors: temperature, water, light, CO2, nutrients (also accepted as TEMPERATURE, WATER, LIGHT, CO2, NUTRIENTS). Provide factor_levels and units for each factor, plus replicates. Does not approve or run the experiment; the server state machine blocks execution until a human approves. Emits experiment_created and approval_requested events. Returns experiment_id, status, estimated_observations, and approval_required. Use when starting a new investigation.",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "question",
        "hypothesis",
        "factors",
        "factor_levels",
        "units",
        "replicates",
        "seed",
        "simulation_version",
        "provenance",
      ],
      properties: {
        question: {
          type: "string",
          minLength: 1,
          description: "Scientific question the experiment asks.",
        },
        hypothesis: {
          type: "string",
          minLength: 1,
          description: "Testable hypothesis for this design.",
        },
        factors: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", enum: [...FACTOR_ENUM] },
          description:
            "Plant-growth factors only: temperature, water, light, CO2, nutrients.",
        },
        factor_levels: {
          type: "object",
          description:
            "Map of factor → numeric levels (keys may be lowercase or TEMPERATURE-style). Every listed factor needs a non-empty array.",
          additionalProperties: {
            type: "array",
            minItems: 1,
            items: { type: "number" },
          },
        },
        units: {
          type: "object",
          description:
            "Map of factor → unit string (e.g. celsius, relative). Required for every factor.",
          additionalProperties: { type: "string", minLength: 1 },
        },
        replicates: {
          type: "integer",
          minimum: 1,
          description: "Number of replicates per factor combination.",
        },
        seed: {
          type: "integer",
          description:
            "Integer RNG seed for the deterministic synthetic simulation.",
        },
        simulation_version: {
          type: "string",
          minLength: 1,
          description: "Simulation engine version string (e.g. nova-sim-v1).",
        },
        provenance: {
          type: "object",
          additionalProperties: false,
          required: ["source", "actor"],
          properties: {
            source: { type: "string", minLength: 1 },
            actor: { type: "string", minLength: 1 },
            notes: { type: "string" },
            parent_experiment_id: {
              type: "string",
              description:
                "Optional parent experiment id for lineage (normally omit; prefer replicate_experiment).",
            },
          },
        },
      },
    },
  },
  {
    name: "run_experiment",
    title: "Run approved experiment",
    description:
      "Execute an already APPROVED experiment on the NOVA server. Human approval is required beforehand; if status is AWAITING_APPROVAL (or otherwise not APPROVED), the server rejects the run with HUMAN_APPROVAL_REQUIRED—the tool does not decide approval itself. On success: synthetic simulation runs, observations persist, status becomes COMPLETED, and lifecycle events are recorded. Returns experiment_id, status, observation_count, simulation_version, and seed. Does not expose hidden simulator world parameters or equations. Use only after a human has approved the design.",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["experiment_id"],
      properties: {
        experiment_id: {
          type: "string",
          minLength: 1,
          description: "Id of an experiment that is currently APPROVED.",
        },
      },
    },
  },
  {
    name: "get_results",
    title: "Get persisted experiment observations",
    description:
      "Return persisted synthetic observations for one experiment_id from the NOVA database. Does not regenerate data or re-run the simulator. Each observation includes factor_values, measured_outcome (biomass, growth_rate), replicate_index, and combination_index. Records a results_retrieved audit event. Returns an empty observations list if the experiment has not been run. Use after run_experiment (or whenever observations already exist).",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["experiment_id"],
      properties: {
        experiment_id: {
          type: "string",
          minLength: 1,
          description:
            "Experiment whose persisted observations should be returned.",
        },
      },
    },
  },
  {
    name: "analyze_results",
    title: "Analyze persisted observations",
    description:
      "Analyze persisted observations for a COMPLETED experiment using NOVA’s statistical engine (growth ~ temperature + water + temperature:water). Retrieves stored observations, calculates effects (not fabricated or LLM-invented), persists an Analysis row, emits analysis_completed, and sets status to ANALYZED. Returns experiment_id, analysis_id, analysis_version, model specification, factor/interaction effects, confidence intervals, significance statistics (t, p, SE), simulation_version, and seed. Does not expose hidden simulator equations. Use after run_experiment.",
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["experiment_id"],
      properties: {
        experiment_id: {
          type: "string",
          minLength: 1,
          description: "COMPLETED experiment with persisted observations.",
        },
      },
    },
  },
  {
    name: "save_finding",
    title: "Save evidence-linked finding",
    description:
      "Persist an interpretive finding written by the external agent, linked to experiment_id and analysis_id. The server validates that the experiment exists, the analysis exists, and the analysis belongs to that experiment—unrelated analysis references are rejected (PROVENANCE_MISMATCH). Does not auto-generate findings; the agent must supply finding_text and confidence. Maintains provenance Finding → Analysis → Experiment → Observations, records finding_saved, and returns finding_id, experiment_id, analysis_id, finding, confidence, and timestamp. Use after analyze_results.",
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["experiment_id", "analysis_id", "finding_text", "confidence"],
      properties: {
        experiment_id: {
          type: "string",
          minLength: 1,
          description: "Experiment that owns the analysis evidence.",
        },
        analysis_id: {
          type: "string",
          minLength: 1,
          description:
            "Persisted analysis that evidences this finding (must belong to experiment_id).",
        },
        finding_text: {
          type: "string",
          minLength: 1,
          description:
            "Agent-authored interpretive claim; not generated by NOVA.",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Reporter confidence in [0, 1].",
        },
        replication_id: {
          type: "string",
          description: "Optional persisted replication record id.",
        },
      },
    },
  },
  {
    name: "replicate_experiment",
    title: "Replicate experiment and evaluate criterion",
    description:
      "Create an independent replication of original_experiment_id using the same experimental design and a NEW server-derived seed. Persists a replication experiment, generates new synthetic observations (not copies), independently calculates replication effects, and evaluates replication_success = same direction AND confidence interval overlap AND relative effect difference < 20%. Persists the Replication record and emits replication_completed. Returns original/replication ids, seeds, effects, confidence intervals, criterion flags, and replication_success. Does not hardcode success or expose hidden simulator internals. Original must already have persisted observations.",
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["original_experiment_id"],
      properties: {
        original_experiment_id: {
          type: "string",
          minLength: 1,
          description:
            "Experiment to replicate (must already have persisted observations).",
        },
      },
    },
  },
] as const;

export type NovaWebMcpToolName = (typeof NOVA_WEBMCP_TOOLS)[number]["name"];
