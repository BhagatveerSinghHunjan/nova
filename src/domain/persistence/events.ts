export const EXPERIMENT_EVENT_TYPES = [
  "tool_call_started",
  "tool_call_completed",
  "experiment_created",
  "approval_requested",
  "approval_granted",
  "experiment_rejected",
  "experiment_started",
  "experiment_completed",
  "results_retrieved",
  "analysis_completed",
  "finding_saved",
  "replication_completed",
] as const;

export type ExperimentEventType = (typeof EXPERIMENT_EVENT_TYPES)[number];

export type ExperimentEventMetadata = Record<string, unknown>;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  tool_call_started: "Tool call started",
  tool_call_completed: "Tool call completed",
  experiment_created: "Experiment created",
  approval_requested: "Approval requested",
  approval_granted: "Approval granted",
  experiment_rejected: "Experiment rejected",
  experiment_started: "Experiment started",
  experiment_completed: "Experiment completed",
  results_retrieved: "Results retrieved",
  analysis_completed: "Analysis completed",
  finding_saved: "Finding saved",
  replication_completed: "Replication completed",
};
