import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeSpecifiedWork,
  activatePhase,
  completeAndFreezePhase,
  applyTransition,
  type BuildRailState,
} from "@buildrail/core";
import { makeState, makeAuthorization, withLifecycle } from "./helpers/state-fixture.js";

// --- authorizeSpecifiedWork -------------------------------------------------

test("authorizeSpecifiedWork succeeds from SPECIFIED with human_owner and a valid authorization", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  const authorization = makeAuthorization({ status: "authorized", id: "BR9" });
  const result = authorizeSpecifiedWork(state, authorization, "human_owner");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.current.lifecycle_state, "AUTHORIZED");
    assert.deepEqual(result.value.authorization, authorization);
  }
});

test("authorizeSpecifiedWork fails with LIFECYCLE_TRANSITION_ILLEGAL when not SPECIFIED", () => {
  const state = withLifecycle(makeState(), "IDEA");
  const result = authorizeSpecifiedWork(state, makeAuthorization({ status: "authorized" }), "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
});

test("authorizeSpecifiedWork fails with LIFECYCLE_AUTHORITY_REQUIRED for non-human_owner actors", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  for (const actor of ["implementation_agent", "independent_reviewer"] as const) {
    const result = authorizeSpecifiedWork(state, makeAuthorization({ status: "authorized" }), actor);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_AUTHORITY_REQUIRED");
  }
});

test("authorizeSpecifiedWork fails with AUTHORIZATION_INACTIVE when supplied status is not authorized", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  for (const status of ["draft", "in_progress", "completed", "revoked"] as const) {
    const result = authorizeSpecifiedWork(state, makeAuthorization({ status }), "human_owner");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
  }
});

test("authorizeSpecifiedWork fails with AUTHORIZATION_PHASE_MISMATCH when id does not match development_phase", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  const result = authorizeSpecifiedWork(state, makeAuthorization({ status: "authorized", id: "OTHER" }), "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_PHASE_MISMATCH");
});

test("authorizeSpecifiedWork fails with the appropriate AUTHORIZATION_* code for a malformed supplied authorization", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  const result = authorizeSpecifiedWork(
    state,
    makeAuthorization({ status: "authorized", specification: "" }),
    "human_owner",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_MISSING");
});

test("bare applyTransition(SPECIFIED -> AUTHORIZED) does not silently succeed as an authorization-less update", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  const result = applyTransition(state, "AUTHORIZED", "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_DEDICATED_OPERATION_REQUIRED");
});

test("authorizeSpecifiedWork purity: input state is unchanged after a successful call", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  const snapshot = JSON.parse(JSON.stringify(state));
  const result = authorizeSpecifiedWork(state, makeAuthorization({ status: "authorized" }), "human_owner");
  assert.equal(result.ok, true);
  assert.deepEqual(state, snapshot, "input state must remain unchanged");
});

// --- activatePhase -----------------------------------------------------------

function fullyClosedState(overrides: Partial<BuildRailState> = {}): BuildRailState {
  return withLifecycle(
    makeState({
      authorization: makeAuthorization({ status: "completed", id: "BR9" }),
      completed_phases: ["BR9"],
      baselines: { BR9: { approved_sha: "a".repeat(40), status: "frozen" } },
      planned_phases: ["BR10", "BR11"],
      candidate: { branch: null, base_sha: null, candidate_sha: null },
      ...overrides,
    }),
    "FROZEN",
  );
}

test("activatePhase succeeds against a fully-closed fixture and atomically rolls over to the new phase", () => {
  const state = fullyClosedState();
  const newAuthorization = makeAuthorization({ status: "authorized", id: "BR10" });
  const result = activatePhase(state, { newPhaseId: "BR10", newAuthorization }, "human_owner");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.current.development_phase, "BR10");
    assert.equal(result.value.current.lifecycle_state, "AUTHORIZED");
    assert.deepEqual(result.value.authorization, newAuthorization);
    assert.deepEqual(result.value.baselines, state.baselines);
    assert.deepEqual(result.value.completed_phases, state.completed_phases);
  }
});

test("activatePhase derives planned_phases removal itself (BR10 removed after success)", () => {
  const state = fullyClosedState();
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.planned_phases, ["BR11"]);
  }
});

test("activatePhase leaves planned_phases unchanged when newPhaseId is not present in it (no-op removal)", () => {
  const state = fullyClosedState({ planned_phases: ["BR11"] });
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.planned_phases, ["BR11"]);
  }
});

test("activatePhase fails with LIFECYCLE_AUTHORITY_REQUIRED for any actor other than human_owner", () => {
  const state = fullyClosedState();
  for (const actor of ["implementation_agent", "independent_reviewer"] as const) {
    const result = activatePhase(
      state,
      { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
      actor,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_AUTHORITY_REQUIRED");
  }
});

test("activatePhase fails with LIFECYCLE_TRANSITION_ILLEGAL when lifecycle_state is not FROZEN", () => {
  const state = withLifecycle(fullyClosedState(), "PRODUCTION_VERIFIED");
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
});

test("activatePhase closure invariants are each independently required — no BR0-bootstrap exception", () => {
  const newAuthorization = makeAuthorization({ status: "authorized", id: "BR10" });

  const notCompletedAuth = fullyClosedState({ authorization: makeAuthorization({ status: "authorized", id: "BR9" }) });
  assert.equal(activatePhase(notCompletedAuth, { newPhaseId: "BR10", newAuthorization }, "human_owner").ok, false);

  const missingFromCompletedPhases = fullyClosedState({ completed_phases: [] });
  assert.equal(activatePhase(missingFromCompletedPhases, { newPhaseId: "BR10", newAuthorization }, "human_owner").ok, false);

  const missingBaseline = fullyClosedState({ baselines: {} });
  assert.equal(activatePhase(missingBaseline, { newPhaseId: "BR10", newAuthorization }, "human_owner").ok, false);

  const baselineNotFrozen = fullyClosedState({
    baselines: { BR9: { approved_sha: "a".repeat(40), status: "frozen" } },
  });
  const nonFrozenState: BuildRailState = {
    ...baselineNotFrozen,
    baselines: { BR9: { approved_sha: "a".repeat(40), status: "frozen" as const } },
  };
  // Simulate a hypothetical non-frozen baseline status by constructing the
  // object directly, bypassing the Baseline["status"] literal-type narrowing
  // a normal caller would have from the schema-derived type.
  (nonFrozenState.baselines!.BR9 as { status: string }).status = "not-frozen";
  assert.equal(activatePhase(nonFrozenState, { newPhaseId: "BR10", newAuthorization }, "human_owner").ok, false);

  const inFlightCandidate = fullyClosedState({ candidate: { branch: "x", base_sha: null, candidate_sha: null } });
  assert.equal(activatePhase(inFlightCandidate, { newPhaseId: "BR10", newAuthorization }, "human_owner").ok, false);
});

test("activatePhase accepts candidate absent as equivalent to fully-null (shape A vs shape B)", () => {
  const withNullCandidate = fullyClosedState({ candidate: { branch: null, base_sha: null, candidate_sha: null } });
  const r1 = activatePhase(
    withNullCandidate,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(r1.ok, true, "fully-null candidate (shape B) should be accepted");

  const { candidate, ...withoutCandidateField } = fullyClosedState();
  void candidate;
  const r2 = activatePhase(
    withoutCandidateField as BuildRailState,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(r2.ok, true, "absent candidate (shape A) should be accepted equivalently");
});

test("activatePhase rejects reactivating a phase ID already present in baselines", () => {
  const state = fullyClosedState({
    baselines: {
      BR9: { approved_sha: "a".repeat(40), status: "frozen" },
      BR10: { approved_sha: "b".repeat(40), status: "frozen" },
    },
  });
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
});

test("activatePhase rejects reactivating a phase ID already present in completed_phases", () => {
  const state = fullyClosedState({ completed_phases: ["BR9", "BR10"] });
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
});

test("activatePhase fails with AUTHORIZATION_INACTIVE when newAuthorization.status is not authorized", () => {
  const state = fullyClosedState();
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "draft", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
});

test("activatePhase fails with AUTHORIZATION_PHASE_MISMATCH when newAuthorization.id !== newPhaseId", () => {
  const state = fullyClosedState();
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "WRONG" }) },
    "human_owner",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_PHASE_MISMATCH");
});

test("activatePhase purity: input state is unchanged after a successful call", () => {
  const state = fullyClosedState();
  const snapshot = JSON.parse(JSON.stringify(state));
  const result = activatePhase(
    state,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(result.ok, true);
  assert.deepEqual(state, snapshot, "input state must remain unchanged");
});

// --- completeAndFreezePhase --------------------------------------------------

const APPROVED_SHA = "c".repeat(40);

function productionVerifiedState(overrides: Partial<BuildRailState> = {}): BuildRailState {
  return withLifecycle(
    makeState({
      authorization: makeAuthorization({ status: "authorized", id: "BR9" }),
      completed_phases: [],
      ...overrides,
    }),
    "PRODUCTION_VERIFIED",
  );
}

test("completeAndFreezePhase succeeds and atomically closes the phase", () => {
  const state = productionVerifiedState();
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.current.lifecycle_state, "FROZEN");
    assert.equal(result.value.authorization?.status, "completed");
    assert.deepEqual(result.value.completed_phases, ["BR9"]);
    assert.deepEqual(result.value.baselines?.BR9, { approved_sha: APPROVED_SHA, status: "frozen" });
    assert.deepEqual(result.value.candidate, { branch: null, base_sha: null, candidate_sha: null });
  }
});

test("completeAndFreezePhase composes checkImplementationAllowed verbatim — revoked authorization produces AUTHORIZATION_REVOKED, not AUTHORIZATION_INACTIVE", () => {
  const state = productionVerifiedState({ authorization: makeAuthorization({ status: "revoked", id: "BR9" }) });
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_REVOKED");
});

test("completeAndFreezePhase fails with AUTHORIZATION_MISSING when authorization is absent", () => {
  const { authorization, ...rest } = productionVerifiedState();
  void authorization;
  const result = completeAndFreezePhase(rest as BuildRailState, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_MISSING");
});

test("completeAndFreezePhase fails with AUTHORIZATION_INACTIVE for draft/completed authorization", () => {
  for (const status of ["draft", "completed"] as const) {
    const state = productionVerifiedState({ authorization: makeAuthorization({ status, id: "BR9" }) });
    const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
  }
});

test("completeAndFreezePhase fails with LIFECYCLE_AUTHORITY_REQUIRED for non-human_owner actors", () => {
  const state = productionVerifiedState();
  for (const actor of ["implementation_agent", "independent_reviewer"] as const) {
    const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, actor);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_AUTHORITY_REQUIRED");
  }
});

test("completeAndFreezePhase fails with LIFECYCLE_TRANSITION_ILLEGAL when lifecycle_state is not PRODUCTION_VERIFIED", () => {
  const state = withLifecycle(productionVerifiedState(), "MERGED");
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
});

test("completeAndFreezePhase rejects closing an already-completed phase (no idempotent re-closure)", () => {
  const state = productionVerifiedState({ completed_phases: ["BR9"] });
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
});

test("completeAndFreezePhase rejects overwriting an existing baseline, and the pre-existing entry is unchanged", () => {
  const existingBaseline = { approved_sha: "d".repeat(40), status: "frozen" as const };
  const state = productionVerifiedState({ baselines: { BR9: existingBaseline } });
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_TRANSITION_ILLEGAL");
  assert.deepEqual(state.baselines?.BR9, existingBaseline, "existing baseline must be unchanged after the rejected call");
});

test("completeAndFreezePhase fails with BASELINE_SHA_INVALID for a malformed approvedSha", () => {
  const state = productionVerifiedState();
  for (const badSha of ["short", "A".repeat(40), "g".repeat(40), ""]) {
    const result = completeAndFreezePhase(state, { approvedSha: badSha }, "human_owner");
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(badSha)}`);
    if (!result.ok) assert.equal(result.error.code, "BASELINE_SHA_INVALID");
  }
});

test("completeAndFreezePhase: closure with candidate absent creates the canonical fully-null candidate object", () => {
  const { candidate, ...rest } = productionVerifiedState();
  void candidate;
  const result = completeAndFreezePhase(rest as BuildRailState, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.candidate, { branch: null, base_sha: null, candidate_sha: null });
  }
});

test("completeAndFreezePhase: closure with baselines absent creates a new map with exactly the one new entry", () => {
  const { baselines, ...rest } = productionVerifiedState();
  void baselines;
  const result = completeAndFreezePhase(rest as BuildRailState, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.baselines, { BR9: { approved_sha: APPROVED_SHA, status: "frozen" } });
  }
});

test("completeAndFreezePhase preserves existing baselines entries alongside the new one", () => {
  const state = productionVerifiedState({
    current: { lifecycle_state: "PRODUCTION_VERIFIED", development_phase: "BR9" },
    baselines: { BR8: { approved_sha: "e".repeat(40), status: "frozen" } },
  });
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.baselines, {
      BR8: { approved_sha: "e".repeat(40), status: "frozen" },
      BR9: { approved_sha: APPROVED_SHA, status: "frozen" },
    });
  }
});

test("completeAndFreezePhase: successful output satisfies activatePhase's own closure-invariant precondition directly", () => {
  const state = productionVerifiedState({ planned_phases: ["BR10"] });
  const closed = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(closed.ok, true);
  if (!closed.ok) return;
  const rolledOver = activatePhase(
    closed.value,
    { newPhaseId: "BR10", newAuthorization: makeAuthorization({ status: "authorized", id: "BR10" }) },
    "human_owner",
  );
  assert.equal(rolledOver.ok, true, "activatePhase must accept completeAndFreezePhase's output directly");
});

test("applyTransition(PRODUCTION_VERIFIED -> FROZEN) does not silently succeed as a lifecycle-only update", () => {
  const state = productionVerifiedState();
  const result = applyTransition(state, "FROZEN", "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_DEDICATED_OPERATION_REQUIRED");
});

test("completeAndFreezePhase purity: full deep snapshot of the input state is unchanged after a successful call", () => {
  const state = productionVerifiedState({
    baselines: { BR8: { approved_sha: "e".repeat(40), status: "frozen" } },
    candidate: { branch: "in-flight", base_sha: null, candidate_sha: null },
  });
  const snapshot = JSON.parse(JSON.stringify(state));
  const result = completeAndFreezePhase(state, { approvedSha: APPROVED_SHA }, "human_owner");
  assert.equal(result.ok, true);
  assert.deepEqual(state, snapshot, "input state (including nested authorization/candidate/baselines) must remain unchanged");
  if (result.ok) {
    assert.notDeepEqual(result.value, state, "returned state must differ from the (unchanged) input");
  }
});
