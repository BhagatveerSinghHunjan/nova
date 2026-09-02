import type { SimulationObservation } from "@prisma/client";

import { LabEmpty, LabPanel } from "@/components/experiments/lab-ui";

type FactorValues = Record<string, number>;

function asFactorValues(value: unknown): FactorValues {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as FactorValues;
}

function combinationKey(factorValues: FactorValues): string {
  return Object.keys(factorValues)
    .sort()
    .map((key) => `${key}=${factorValues[key]}`)
    .join(" · ");
}

export function ObservationsPanel({
  observations,
  estimatedObservations,
}: {
  observations: SimulationObservation[];
  estimatedObservations: number;
}) {
  if (observations.length === 0) {
    return (
      <LabEmpty
        title="No observations"
        message="No observations persisted yet. Run the experiment after approval to generate synthetic results."
      />
    );
  }

  const groups = new Map<
    string,
    {
      combinationIndex: number;
      factorValues: FactorValues;
      rows: SimulationObservation[];
    }
  >();

  for (const observation of observations) {
    const factorValues = asFactorValues(observation.factorValues);
    const key = `${observation.combinationIndex}:${combinationKey(factorValues)}`;
    const existing = groups.get(key);

    if (existing) {
      existing.rows.push(observation);
    } else {
      groups.set(key, {
        combinationIndex: observation.combinationIndex,
        factorValues,
        rows: [observation],
      });
    }
  }

  const grouped = [...groups.values()].sort(
    (left, right) => left.combinationIndex - right.combinationIndex,
  );

  return (
    <LabPanel>
      <div className="space-y-6">
        <p className="text-sm text-zinc-300">
          Total observations:{" "}
          <span className="font-mono text-zinc-100">
            {observations.length}
          </span>
          {estimatedObservations > 0
            ? ` · design estimate ${estimatedObservations}`
            : ""}
          {" · "}
          {grouped.length} factor combination
          {grouped.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-zinc-600">
          Result from NOVA&apos;s synthetic experimental simulation.
        </p>

        <div className="space-y-8">
          {grouped.map((group) => (
            <div
              key={`${group.combinationIndex}-${combinationKey(group.factorValues)}`}
            >
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-400">
                  Combination {group.combinationIndex}
                </p>
                <p className="text-xs text-zinc-500">
                  {Object.entries(group.factorValues)
                    .map(([factor, value]) => `${factor}: ${value}`)
                    .join(" · ") || "No factor values"}
                </p>
              </div>

              <div className="overflow-x-auto border border-zinc-800">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Replicate</th>
                      {Object.keys(group.factorValues)
                        .sort()
                        .map((factor) => (
                          <th key={factor}>{factor}</th>
                        ))}
                      <th>Biomass</th>
                      <th>Growth rate</th>
                      <th>Obs. seed</th>
                      <th>Sim version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((observation) => {
                      const factorValues = asFactorValues(
                        observation.factorValues,
                      );

                      return (
                        <tr key={observation.id}>
                          <td className="font-mono">
                            {observation.replicateIndex}
                          </td>
                          {Object.keys(group.factorValues)
                            .sort()
                            .map((factor) => (
                              <td key={factor} className="font-mono">
                                {factorValues[factor] ?? "—"}
                              </td>
                            ))}
                          <td className="font-mono">
                            {observation.biomass.toFixed(6)}
                          </td>
                          <td className="font-mono">
                            {observation.growthRate.toFixed(6)}
                          </td>
                          <td className="font-mono">
                            {observation.observationSeed}
                          </td>
                          <td className="font-mono">
                            {observation.simulationVersion}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <details className="border border-zinc-800 bg-zinc-950/50 p-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Inspect raw structured observations
          </summary>
          <pre className="mt-4 max-h-96 overflow-auto text-[11px] leading-relaxed text-zinc-400">
            {JSON.stringify(
              observations.map((observation) => ({
                id: observation.id,
                experimentId: observation.experimentId,
                replicateIndex: observation.replicateIndex,
                combinationIndex: observation.combinationIndex,
                factorValues: observation.factorValues,
                biomass: observation.biomass,
                growthRate: observation.growthRate,
                observationSeed: observation.observationSeed,
                simulationVersion: observation.simulationVersion,
                dataLabel: observation.dataLabel,
                createdAt: observation.createdAt,
              })),
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </LabPanel>
  );
}
