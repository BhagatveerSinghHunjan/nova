import { ExperimentStatus } from "@prisma/client";

import { invalidTransitionError } from "./errors";

const VALID_TRANSITIONS: Readonly<
  Record<ExperimentStatus, readonly ExperimentStatus[]>
> = {
  [ExperimentStatus.DRAFT]: [ExperimentStatus.AWAITING_APPROVAL],
  [ExperimentStatus.AWAITING_APPROVAL]: [
    ExperimentStatus.APPROVED,
    ExperimentStatus.REJECTED,
  ],
  [ExperimentStatus.REJECTED]: [ExperimentStatus.DRAFT],
  [ExperimentStatus.APPROVED]: [ExperimentStatus.RUNNING],
  [ExperimentStatus.RUNNING]: [ExperimentStatus.COMPLETED],
  [ExperimentStatus.COMPLETED]: [ExperimentStatus.ANALYZED],
  [ExperimentStatus.ANALYZED]: [ExperimentStatus.REPLICATED],
  [ExperimentStatus.REPLICATED]: [],
};

export function canTransition(
  from: ExperimentStatus,
  to: ExperimentStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(
  from: ExperimentStatus,
  to: ExperimentStatus,
): void {
  if (!canTransition(from, to)) {
    throw invalidTransitionError(from, to);
  }
}

export function assertExperimentCanExecute(status: ExperimentStatus): void {
  if (
    status === ExperimentStatus.REJECTED ||
    status !== ExperimentStatus.APPROVED
  ) {
    throw invalidTransitionError(status, ExperimentStatus.RUNNING);
  }
}

export function getValidTransitions(
  from: ExperimentStatus,
): readonly ExperimentStatus[] {
  return VALID_TRANSITIONS[from];
}
