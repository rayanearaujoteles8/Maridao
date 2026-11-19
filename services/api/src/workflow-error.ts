export class WorkflowError extends Error {
  status: number;
  // Campos extras da resposta (ex.: code, fields), além de error.
  details?: Record<string, unknown>;
  constructor(status: number, message: string, details?: Record<string, unknown>) { super(message); this.status = status; this.details = details; }
}
