import Link from "next/link";
import type { ExperimentEvent } from "@prisma/client";

import { LabEmpty } from "@/components/experiments/lab-ui";
import { EVENT_TYPE_LABELS } from "@/domain/persistence/events";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value);
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function relatedEntityLabel(metadata: Record<string, unknown>): string | null {
  const candidates = [
    ["analysisId", "analysis"],
    ["findingId", "finding"],
    ["replicationId", "replication"],
    ["replicationExperimentId", "replica experiment"],
    ["toolName", "tool"],
  ] as const;

  for (const [key, label] of candidates) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) {
      return `${label} ${value}`;
    }
  }

  return null;
}

function usefulMetadataLines(
  metadata: Record<string, unknown>,
): { key: string; value: string }[] {
  const preferredKeys = [
    "fromStatus",
    "toStatus",
    "seed",
    "simulationVersion",
    "analysisVersion",
    "observationCount",
    "approvalRationale",
    "rejectionRationale",
    "replicationSuccess",
    "sameDirection",
    "confidenceIntervalOverlap",
    "relativeEffectDifference",
    "confidence",
    "toolName",
  ];

  const lines: { key: string; value: string }[] = [];

  for (const key of preferredKeys) {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (typeof value === "object") {
      continue;
    }

    lines.push({ key, value: String(value) });
  }

  return lines.slice(0, 6);
}

export function ActivityTimeline({
  events,
  showExperimentLink = false,
  emptyMessage = "No persisted events for this experiment yet.",
}: {
  events: Array<
    ExperimentEvent & {
      experiment?: { id: string; question: string } | null;
    }
  >;
  showExperimentLink?: boolean;
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return <LabEmpty title="No events" message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-600">
        Application audit history from persisted event records. This view does
        not imply WebMCP tool invocation.
      </p>

      <ol className="space-y-0">
        {events.map((event, index) => {
          const metadata = asMetadata(event.metadata);
          const related = relatedEntityLabel(metadata);
          const details = usefulMetadataLines(metadata);
          const label = EVENT_TYPE_LABELS[event.type] ?? event.type;

          return (
            <li key={event.id} className="relative flex gap-4 pb-5">
              <div className="flex w-4 flex-col items-center">
                <span className="mt-1 h-2 w-2 rounded-full bg-zinc-400" />
                {index < events.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-zinc-800" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1 border-b border-zinc-900 pb-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-200">
                    {label}
                  </p>
                  <p className="font-mono text-[11px] text-zinc-600">
                    {formatDate(event.createdAt)}
                  </p>
                </div>

                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                  <p>
                    type{" "}
                    <span className="font-mono text-zinc-400">{event.type}</span>
                  </p>
                  <p>
                    experiment{" "}
                    {showExperimentLink ? (
                      <Link
                        href={`/experiments/${event.experimentId}`}
                        className="font-mono text-zinc-300 underline-offset-2 hover:underline"
                      >
                        {event.experimentId}
                      </Link>
                    ) : (
                      <span className="font-mono text-zinc-400">
                        {event.experimentId}
                      </span>
                    )}
                    {event.experiment?.question ? (
                      <span className="text-zinc-600">
                        {" "}
                        · {event.experiment.question}
                      </span>
                    ) : null}
                  </p>
                  {related ? (
                    <p>
                      related{" "}
                      <span className="font-mono text-zinc-400">{related}</span>
                    </p>
                  ) : null}
                </div>

                {details.length > 0 ? (
                  <dl className="mt-3 grid gap-1 sm:grid-cols-2">
                    {details.map((detail) => (
                      <div key={detail.key} className="text-[11px]">
                        <dt className="inline font-mono uppercase tracking-[0.12em] text-zinc-600">
                          {detail.key}
                        </dt>
                        <dd className="ml-2 inline break-all font-mono text-zinc-400">
                          {detail.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
