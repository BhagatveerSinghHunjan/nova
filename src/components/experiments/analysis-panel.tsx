import type { Analysis } from "@prisma/client";

import type { EffectEstimate } from "@/domain/analysis/types";
import { LabEmpty, LabField, LabPanel } from "@/components/experiments/lab-ui";

type PersistedEffects = {
  temperature?: EffectEstimate;
  water?: EffectEstimate;
  temperature_water_interaction?: EffectEstimate;
};

function asEffects(value: unknown): PersistedEffects {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as PersistedEffects;
}

function EffectRow({
  label,
  effect,
}: {
  label: string;
  effect: EffectEstimate | undefined;
}) {
  if (!effect) {
    return (
      <tr>
        <td>{label}</td>
        <td className="text-zinc-600" colSpan={6}>
          Not present in persisted analysis
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="font-mono text-zinc-200">{label}</td>
      <td className="font-mono">{effect.estimate.toFixed(6)}</td>
      <td className="font-mono">{effect.standard_error.toFixed(6)}</td>
      <td className="font-mono">
        [{effect.confidence_interval.lower.toFixed(6)},{" "}
        {effect.confidence_interval.upper.toFixed(6)}]
        <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          {effect.confidence_interval.level * 100}% CI
        </span>
      </td>
      <td className="font-mono">{effect.t_statistic.toFixed(4)}</td>
      <td className="font-mono">{effect.p_value.toFixed(6)}</td>
      <td className="font-mono uppercase tracking-[0.12em] text-zinc-400">
        {effect.direction}
      </td>
    </tr>
  );
}

export function AnalysisPanel({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) {
    return (
      <LabEmpty
        title="No analysis"
        message="No analysis has been persisted for this experiment. Complete the run, then analyze results."
      />
    );
  }

  const effects = asEffects(analysis.effects);

  return (
    <LabPanel>
      <div className="space-y-5">
        <p className="text-sm text-zinc-400">
          Statistics derived from persisted synthetic observations—not
          real-world measurements.
        </p>

        <dl className="grid gap-4 sm:grid-cols-2">
          <LabField label="Analysis version" mono>
            {analysis.analysisVersion}
          </LabField>
          <LabField label="Model specification" mono>
            <span className="text-xs">{analysis.model}</span>
          </LabField>
          <LabField label="Simulation version" mono>
            {analysis.simulationVersion}
          </LabField>
          <LabField label="Seed" mono>
            {analysis.seed}
          </LabField>
          <LabField label="Response" mono>
            {analysis.responseVariable}
          </LabField>
          <LabField label="Sample / residual SE" mono>
            n={analysis.sampleSize} · df={analysis.residualDegreesOfFreedom} ·
            RSE={analysis.residualStandardError}
          </LabField>
        </dl>

        <div className="overflow-x-auto border border-zinc-800">
          <table className="lab-table">
            <thead>
              <tr>
                <th>Effect</th>
                <th>Estimate</th>
                <th>Std. error</th>
                <th>Confidence interval</th>
                <th>t</th>
                <th>p</th>
                <th>Direction</th>
              </tr>
            </thead>
            <tbody>
              <EffectRow label="temperature" effect={effects.temperature} />
              <EffectRow label="water" effect={effects.water} />
              <EffectRow
                label="temperature × water"
                effect={effects.temperature_water_interaction}
              />
            </tbody>
          </table>
        </div>
      </div>
    </LabPanel>
  );
}
