export class SimulationDomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "SimulationDomainError";
    this.code = code;
  }
}
