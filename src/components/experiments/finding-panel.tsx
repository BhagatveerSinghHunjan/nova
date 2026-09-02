import type { ReactNode } from "react";
import type { Analysis, Finding } from "@prisma/client";

import { LabEmpty, LabField, LabPanel } from "@/components/experiments/lab-ui";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function FindingPanel({
  finding,
  analysis,
  experimentId,
  findingForm,
}: {
  finding: Finding | null;
  analysis: Analysis | null;
  experimentId: string;
  findingForm?: ReactNode;
}) {
  if (!finding) {
    return (
      <div className="space-y-4">
        <LabEmpty
          title="No finding"
          message="No finding has been persisted for this experiment. Findings are interpretive claims linked to analysis evidence—not automatic conclusions."
        />
        {analysis ? findingForm : null}
      </div>
    );
  }

  return (
    <LabPanel>
      <div className="space-y-5">
        <p className="text-base leading-relaxed text-zinc-100">
          {finding.findingText}
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <LabField label="Confidence" mono>
            {finding.confidence}
          </LabField>
          <LabField label="Timestamp">{formatDate(finding.createdAt)}</LabField>
          <LabField label="Experiment ID" mono>
            <span className="break-all text-xs">
              {finding.experimentId || experimentId}
            </span>
          </LabField>
          <LabField label="Analysis evidence" mono>
            <span className="break-all text-xs">{finding.analysisId}</span>
            {analysis ? (
              <span className="mt-1 block text-zinc-500">
                model {analysis.model} · v{analysis.analysisVersion}
              </span>
            ) : null}
          </LabField>
        </dl>
        <p className="text-xs text-zinc-600">
          Evidence chain: Finding → Analysis {finding.analysisId} → Experiment{" "}
          {finding.experimentId} → Observations
        </p>
      </div>
    </LabPanel>
  );
}
