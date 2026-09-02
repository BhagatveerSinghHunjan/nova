export class ExperimentDomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ExperimentDomainError";
    this.code = code;
  }
}

export function invalidTransitionError(
  from: string,
  to: string,
): ExperimentDomainError {
  return new ExperimentDomainError(
    `Invalid experiment transition: ${from} → ${to}`,
    "INVALID_TRANSITION",
  );
}

export function invalidStatusError(
  expected: string,
  actual: string,
  action: string,
): ExperimentDomainError {
  return new ExperimentDomainError(
    `Cannot ${action}: experiment must be ${expected}, but is ${actual}`,
    "INVALID_STATUS",
  );
}
