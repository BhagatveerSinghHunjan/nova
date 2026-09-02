import type { ReactNode } from "react";
import Link from "next/link";
import type { Analysis, Finding, Replication } from "@prisma/client";

import type { FactorLevels } from "@/domain/experiment/types";
import type { EffectEstimate } from "@/domain/analysis/types";

type ExperimentSummary = {
  id: string;
  question: string;
  factors: string[];
  replicates: number;
  seed: number;
  simulationVersion: string;
  createdAt: Date;
  updatedAt: Date;
  observationCount: number;
};

type ReplicationView = Replication & {
  replicationExperiment: {
    id: string;
    question: string;
    seed: number;
    status: string;
    factors?: string[];
    replicates?: number;
    simulationVersion?: string;
    createdAt?: Date;
    updatedAt?: Date;
    _count?: { observations: number };
  };
};

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatFactors(factors: string[], factorLevels: FactorLevels) {
  if (factors.length === 0) {
    return "—";
  }

  return factors
    .map((factor) => {
      const levels = factorLevels[factor as keyof FactorLevels];
      return levels?.length ? `${factor} [${levels.join(", ")}]` : factor;
    })
    .join(" · ");
}

function ChainArrow() {
  return (
    <div className="flex justify-center py-2 font-mono text-zinc-600" aria-hidden>
      ↓
    </div>
  );
}

function ProvenanceNode({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <div className="mt-3 space-y-2 text-sm text-zinc-300">{children}</div>
    </div>
  );
}

function Field({
  name,
  value,
}: {
  name: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
        {name}
      </dt>
      <dd className="mt-1 break-words text-zinc-200">{value}</dd>
    </div>
  );
}

function EffectsSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") {
    return <span className="text-zinc-600">—</span>;
  }

  const effects = value as Record<string, EffectEstimate>;
  const entries = Object.entries(effects);

  if (entries.length === 0) {
    return <span className="text-zinc-600">—</span>;
  }

  return (
    <ul className="space-y-2 font-mono text-xs text-zinc-400">
      {entries.map(([name, effect]) => (
        <li key={name}>
          <span className="text-zinc-200">{name}</span>: estimate{" "}
          {effect.estimate?.toFixed?.(6) ?? String(effect.estimate)}
          {effect.confidence_interval
            ? ` · CI [${effect.confidence_interval.lower.toFixed(6)}, ${effect.confidence_interval.upper.toFixed(6)}]`
            : ""}
          {typeof effect.p_value === "number"
            ? ` · p=${effect.p_value.toFixed(6)}`
            : ""}
        </li>
      ))}
    </ul>
  );
}

function ConfidenceIntervalsSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") {
    return <span className="text-zinc-600">—</span>;
  }

  return (
    <pre className="overflow-x-auto text-[11px] leading-relaxed text-zinc-400">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ProvenancePanel({
  experiment,
  factorLevels,
  analysis,
  finding,
  replication,
}: {
  experiment: ExperimentSummary & {
    parentExperiment: { id: string; question: string; status: string } | null;
    childExperiments: { id: string; question: string; status: string }[];
  };
  factorLevels: FactorLevels;
  analysis: Analysis | null;
  finding: Finding | null;
  replication: ReplicationView | null;
}) {
  const hasPrimaryChain = Boolean(finding || analysis || experiment);
  const replicaObservationCount =
    replication?.replicationExperiment._count?.observations ?? null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm text-zinc-400">
          A finding is not an isolated text box. It is produced through a
          persisted evidence chain ending in synthetic observations.
        </p>
        <p className="text-xs text-zinc-600">
          Result from NOVA&apos;s synthetic experimental simulation.
        </p>
      </div>

      {!finding && !analysis ? (
        <p className="text-sm text-zinc-500">
          Provenance chain is incomplete until analysis and/or a finding are
          persisted. Experiment and observation links are shown below when
          available.
        </p>
      ) : null}

      {hasPrimaryChain ? (
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Primary evidence chain
          </p>

          {finding ? (
            <>
              <ProvenanceNode label="Finding">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Field name="Finding ID" value={<span className="font-mono text-xs">{finding.id}</span>} />
                  <Field name="Confidence" value={<span className="font-mono">{finding.confidence}</span>} />
                  <Field name="Finding text" value={finding.findingText} />
                  <Field
                    name="Source analysis"
                    value={
                      <span className="font-mono text-xs">{finding.analysisId}</span>
                    }
                  />
                </dl>
              </ProvenanceNode>
              <ChainArrow />
            </>
          ) : null}

          {analysis ? (
            <>
              <ProvenanceNode label="Analysis">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Field name="Analysis ID" value={<span className="font-mono text-xs">{analysis.id}</span>} />
                  <Field name="Analysis version" value={<span className="font-mono">{analysis.analysisVersion}</span>} />
                  <Field name="Model" value={<span className="font-mono text-xs">{analysis.model}</span>} />
                  <Field name="Timestamp" value={formatDate(analysis.createdAt)} />
                  <div className="sm:col-span-2">
                    <Field
                      name="Effects + confidence intervals"
                      value={<EffectsSummary value={analysis.effects} />}
                    />
                  </div>
                </dl>
              </ProvenanceNode>
              <ChainArrow />
            </>
          ) : finding ? (
            <>
              <ProvenanceNode label="Analysis">
                <p className="text-zinc-500">
                  Linked analysis ID{" "}
                  <span className="font-mono text-xs text-zinc-300">
                    {finding.analysisId}
                  </span>{" "}
                  was not loaded with this view.
                </p>
              </ProvenanceNode>
              <ChainArrow />
            </>
          ) : null}

          <ProvenanceNode label="Experiment">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field name="Experiment ID" value={<span className="font-mono text-xs">{experiment.id}</span>} />
              <Field name="Question" value={experiment.question} />
              <Field
                name="Factors"
                value={formatFactors(experiment.factors, factorLevels)}
              />
              <Field name="Replicates" value={experiment.replicates} />
              <Field name="Seed" value={<span className="font-mono">{experiment.seed}</span>} />
              <Field
                name="Simulation version"
                value={<span className="font-mono">{experiment.simulationVersion}</span>}
              />
              <Field name="Created" value={formatDate(experiment.createdAt)} />
              <Field name="Updated" value={formatDate(experiment.updatedAt)} />
            </dl>
          </ProvenanceNode>
          <ChainArrow />
          <ProvenanceNode label="Observations">
            <p>
              <span className="font-mono text-zinc-100">
                {experiment.observationCount}
              </span>{" "}
              persisted synthetic observation
              {experiment.observationCount === 1 ? "" : "s"} linked to this
              experiment.
            </p>
            {experiment.observationCount === 0 ? (
              <p className="text-zinc-500">
                No observations yet—finding evidence is incomplete.
              </p>
            ) : (
              <p className="text-xs text-zinc-600">
                Factor values, replicates, and measured outcomes are shown in
                the Observations section above.
              </p>
            )}
          </ProvenanceNode>
        </div>
      ) : null}

      {replication ? (
        <div className="space-y-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Replication evidence chains
          </p>

          <ProvenanceNode label="Replication">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field
                name="Original experiment ID"
                value={
                  <Link
                    href={`/experiments/${replication.originalExperimentId}`}
                    className="font-mono text-xs underline-offset-2 hover:underline"
                  >
                    {replication.originalExperimentId}
                  </Link>
                }
              />
              <Field
                name="Replication experiment ID"
                value={
                  <Link
                    href={`/experiments/${replication.replicationExperimentId}`}
                    className="font-mono text-xs underline-offset-2 hover:underline"
                  >
                    {replication.replicationExperimentId}
                  </Link>
                }
              />
              <Field
                name="Original seed"
                value={<span className="font-mono">{replication.originalSeed}</span>}
              />
              <Field
                name="Replication seed"
                value={
                  <span className="font-mono">{replication.replicationSeed}</span>
                }
              />
              <Field name="Same direction" value={String(replication.sameDirection)} />
              <Field
                name="CI overlap"
                value={String(replication.confidenceIntervalOverlap)}
              />
              <Field
                name="Relative effect difference"
                value={
                  <span className="font-mono">
                    {replication.relativeEffectDifference}
                  </span>
                }
              />
              <Field
                name="Replication success"
                value={String(replication.replicationSuccess)}
              />
              <div className="sm:col-span-2">
                <Field
                  name="Original effect"
                  value={<EffectsSummary value={replication.originalEffect} />}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  name="Replication effect"
                  value={<EffectsSummary value={replication.replicationEffect} />}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  name="Original confidence intervals"
                  value={
                    <ConfidenceIntervalsSummary
                      value={replication.originalConfidenceInterval}
                    />
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  name="Replication confidence intervals"
                  value={
                    <ConfidenceIntervalsSummary
                      value={replication.replicationConfidenceInterval}
                    />
                  }
                />
              </div>
            </dl>
          </ProvenanceNode>

          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Finding → Replication → Original experiment → Observations
              </p>
              {finding ? (
                <>
                  <ProvenanceNode label="Finding">
                    <p className="font-mono text-xs">{finding.id}</p>
                    <p>{finding.findingText}</p>
                  </ProvenanceNode>
                  <ChainArrow />
                </>
              ) : null}
              <ProvenanceNode label="Replication">
                <p className="font-mono text-xs">{replication.id}</p>
                <p>
                  success={String(replication.replicationSuccess)} · seeds{" "}
                  {replication.originalSeed} → {replication.replicationSeed}
                </p>
              </ProvenanceNode>
              <ChainArrow />
              <ProvenanceNode label="Original experiment">
                <p className="font-mono text-xs">{experiment.id}</p>
                <p>{experiment.question}</p>
                <p className="font-mono text-xs text-zinc-500">
                  seed {experiment.seed} · {experiment.simulationVersion}
                </p>
              </ProvenanceNode>
              <ChainArrow />
              <ProvenanceNode label="Original observations">
                <p>
                  <span className="font-mono">{experiment.observationCount}</span>{" "}
                  observations
                </p>
              </ProvenanceNode>
            </div>

            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Replication → Replication experiment → Observations
              </p>
              <ProvenanceNode label="Replication">
                <p className="font-mono text-xs">{replication.id}</p>
              </ProvenanceNode>
              <ChainArrow />
              <ProvenanceNode label="Replication experiment">
                <p className="font-mono text-xs">
                  <Link
                    href={`/experiments/${replication.replicationExperiment.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {replication.replicationExperiment.id}
                  </Link>
                </p>
                <p>{replication.replicationExperiment.question}</p>
                <p className="font-mono text-xs text-zinc-500">
                  seed {replication.replicationExperiment.seed}
                  {replication.replicationExperiment.simulationVersion
                    ? ` · ${replication.replicationExperiment.simulationVersion}`
                    : ""}
                </p>
              </ProvenanceNode>
              <ChainArrow />
              <ProvenanceNode label="Replication observations">
                <p>
                  {replicaObservationCount === null ? (
                    <span className="text-zinc-500">
                      Observation count unavailable
                    </span>
                  ) : (
                    <>
                      <span className="font-mono">{replicaObservationCount}</span>{" "}
                      observations
                    </>
                  )}
                </p>
              </ProvenanceNode>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          No replication record persisted for this experiment.
        </p>
      )}

      {(experiment.parentExperiment || experiment.childExperiments.length > 0) && (
        <div className="space-y-2 text-sm text-zinc-400">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Experiment lineage
          </p>
          {experiment.parentExperiment ? (
            <p>
              Parent:{" "}
              <Link
                href={`/experiments/${experiment.parentExperiment.id}`}
                className="text-zinc-200 underline-offset-2 hover:underline"
              >
                {experiment.parentExperiment.question}
              </Link>
            </p>
          ) : (
            <p>Root experiment (no parent).</p>
          )}
          {experiment.childExperiments.map((child) => (
            <p key={child.id}>
              Child:{" "}
              <Link
                href={`/experiments/${child.id}`}
                className="text-zinc-200 underline-offset-2 hover:underline"
              >
                {child.question}
              </Link>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
