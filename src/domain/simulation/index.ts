export { SimulationDomainError } from "./errors";
export {
  countFactorCombinations,
  generateFactorCombinations,
} from "./design";
export {
  createReplicationSeed,
  deriveReplicateSeed,
  generateReplicationSeed,
  simulateExperiment,
} from "./simulator";
export { runSimulationForExperiment } from "./run";
export {
  resolveFamilyKey,
  selectSimulationWorld,
} from "./world-selection";
export { getSimulationWorld, listSimulationWorldKeys } from "./worlds";
export { toPublicSimulationResult } from "./simulator";

export type {
  ExperimentDesign,
  FactorCombination,
  PublicSimulationResult,
  SimulationResult,
  SimulationWorldKey,
  SyntheticObservation,
} from "./types";
export { SYNTHETIC_DATA_LABEL } from "./types";

export type { RunSimulationInput } from "./run";
