export class AnalysisDomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AnalysisDomainError";
    this.code = code;
  }
}
