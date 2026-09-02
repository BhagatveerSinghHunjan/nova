import { hashString } from "./rng";
import { listSimulationWorldKeys } from "./worlds";
import type { SimulationWorldKey } from "./types";

export function selectSimulationWorld(input: {
  simulationVersion: string;
  familyKey: string;
}): SimulationWorldKey {
  const worldKeys = listSimulationWorldKeys();
  const selector = hashString(`${input.simulationVersion}:${input.familyKey}`);
  return worldKeys[selector % worldKeys.length];
}

export function resolveFamilyKey(input: {
  experimentId: string;
  parentExperimentId?: string;
}): string {
  return input.parentExperimentId ?? input.experimentId;
}
