/**
 * Distinct, typed internal exceptions thrown by `createRegistry()`.
 *
 * `SchemaReferenceUnresolvedError` is thrown specifically when every schema
 * file loaded and parsed as valid JSON, but a `$ref` among the registered
 * schemas could not be resolved against the registered `$id` set.
 *
 * `SchemaSetupError` is thrown for every other registration-time failure: a
 * missing schema asset file, an unreadable file, or malformed/unparseable
 * schema JSON.
 *
 * `loadConfig`/`loadState` distinguish these by type (`instanceof`), not by
 * inspecting a message string, and translate each into its own typed
 * `Result` error code (`SCHEMA_REFERENCE_UNRESOLVED` /
 * `SCHEMA_SETUP_FAILED`) — see the BR2 specification §10's "Schema error
 * taxonomy".
 */
export class SchemaReferenceUnresolvedError extends Error {
  constructor(message: string, readonly cause2?: unknown) {
    super(message);
    this.name = "SchemaReferenceUnresolvedError";
  }
}

export class SchemaSetupError extends Error {
  constructor(message: string, readonly cause2?: unknown) {
    super(message);
    this.name = "SchemaSetupError";
  }
}
