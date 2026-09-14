/**
 * BuildRail Core
 *
 * Provider-neutral governance engine: config/state loading, schema
 * registry, authorization policy, and the lifecycle transition engine.
 * See .buildrail/specs/BR2-GOVERNANCE-ENGINE.md for the full contract.
 */

export type { Result, LoadResult, LoadSuccess, GovernanceDiagnostic, BuildRailError } from "./result.js";

export { loadConfig } from "./config/index.js";
export type { BuildRailConfig, ConfigError, ConfigErrorCode } from "./config/index.js";
export type { ProtectedSystem, ProtectedSystemStatus, QualityGate } from "./config/types.js";

export { loadState } from "./state/index.js";
export type {
  BuildRailState,
  Authorization,
  AuthorizationStatus,
  Candidate,
  Baseline,
  LifecycleState,
  StateError,
  StateErrorCode,
} from "./state/index.js";

export {
  createRegistry,
  CONFIG_SCHEMA_ID,
  STATE_SCHEMA_ID,
  AUTHORIZATION_SCHEMA_ID,
  SchemaReferenceUnresolvedError,
  SchemaSetupError,
} from "./schema/index.js";
export type {
  Br2SchemaId,
  SchemaRegistry,
  SchemaValidateResult,
  SchemaValidationResult,
  SchemaValidationErrorDetail,
} from "./schema/index.js";

export {
  isAuthorizationActive,
  getActiveAuthorization,
  authorizationCoversPhase,
  checkImplementationAllowed,
} from "./policy/index.js";
export type { PolicyError, PolicyErrorCode, PolicyResult } from "./policy/index.js";

export {
  isLegalTransition,
  requiredActor,
  applyTransition,
  authorizeSpecifiedWork,
  activatePhase,
  completeAndFreezePhase,
  TRANSITION_RULES,
} from "./lifecycle/index.js";
export type {
  Actor,
  TransitionRule,
  TransitionError,
  LifecycleError,
  LifecycleErrorCode,
  PhaseActivationRequest,
  PhaseClosureRequest,
} from "./lifecycle/index.js";
