export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface GovernanceDiagnostic {
  severity: "warning";
  message: string;
  path?: string;
}

export interface LoadSuccess<T> {
  value: T;
  diagnostics: GovernanceDiagnostic[];
}

export type LoadResult<T, E> = { ok: true; value: LoadSuccess<T> } | { ok: false; error: E };

export interface BuildRailError {
  code: string;
  message: string;
  path?: string;
  details?: unknown;
}
