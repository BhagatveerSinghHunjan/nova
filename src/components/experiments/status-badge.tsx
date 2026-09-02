import { ExperimentStatus } from "@prisma/client";

const STATUS_STYLES: Record<ExperimentStatus, string> = {
  DRAFT: "border-zinc-600 text-zinc-300 bg-zinc-900",
  AWAITING_APPROVAL: "border-amber-500/70 text-amber-100 bg-amber-950/50",
  REJECTED: "border-rose-500/70 text-rose-100 bg-rose-950/50",
  APPROVED: "border-sky-500/70 text-sky-100 bg-sky-950/50",
  RUNNING: "border-cyan-400/70 text-cyan-50 bg-cyan-950/50",
  COMPLETED: "border-emerald-500/70 text-emerald-100 bg-emerald-950/50",
  ANALYZED: "border-violet-400/70 text-violet-50 bg-violet-950/50",
  REPLICATED: "border-teal-400/70 text-teal-50 bg-teal-950/50",
};

const PIPELINE: ExperimentStatus[] = [
  ExperimentStatus.DRAFT,
  ExperimentStatus.AWAITING_APPROVAL,
  ExperimentStatus.APPROVED,
  ExperimentStatus.RUNNING,
  ExperimentStatus.COMPLETED,
  ExperimentStatus.ANALYZED,
  ExperimentStatus.REPLICATED,
];

export function StatusBadge({
  status,
  size = "md",
}: {
  status: ExperimentStatus;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-3 py-1 text-xs",
    lg: "px-4 py-1.5 text-xs sm:text-sm",
  };

  return (
    <span
      className={`inline-flex items-center rounded-sm border font-mono uppercase tracking-[0.18em] ${STATUS_STYLES[status]} ${sizes[size]}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function StatusPipeline({ status }: { status: ExperimentStatus }) {
  const rejected = status === ExperimentStatus.REJECTED;
  const currentIndex = PIPELINE.indexOf(status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} size="lg" />
        {rejected ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-rose-300/80">
            Cannot run
          </span>
        ) : null}
      </div>

      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {PIPELINE.map((step, index) => {
          const reached =
            !rejected && currentIndex >= 0 && index <= currentIndex;
          const current = step === status;

          return (
            <li key={step} className="flex items-center gap-1">
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  current
                    ? "border-b border-zinc-200 pb-0.5 text-zinc-50"
                    : reached
                      ? "text-zinc-400"
                      : "text-zinc-700"
                }`}
              >
                {step.replaceAll("_", " ")}
              </span>
              {index < PIPELINE.length - 1 ? (
                <span
                  className={`px-1 font-mono text-[10px] ${
                    reached && index < currentIndex
                      ? "text-zinc-500"
                      : "text-zinc-800"
                  }`}
                >
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {rejected ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-rose-400/80">
          Draft → Awaiting approval → Rejected
        </p>
      ) : null}
    </div>
  );
}
