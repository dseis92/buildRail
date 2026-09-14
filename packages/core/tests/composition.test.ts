import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTransition, type LifecycleState } from "@buildrail/core";
import { makeState, makeAuthorization, withLifecycle } from "./helpers/state-fixture.js";

test("applyTransition against a fixture with authorization.status: completed fails with AUTHORIZATION_INACTIVE, not a successful transition", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "completed" }) }), "AUTHORIZED");
  const result = applyTransition(state, "PREFLIGHT", "implementation_agent");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
});

test("applyTransition against a fixture with no authorization at all fails with AUTHORIZATION_MISSING", () => {
  const state = withLifecycle(makeState(), "AUTHORIZED");
  const result = applyTransition(state, "PREFLIGHT", "implementation_agent");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_MISSING");
});

test("applyTransition against a fixture with authorization.id for a different phase fails with AUTHORIZATION_PHASE_MISMATCH", () => {
  const state = withLifecycle(
    makeState({ authorization: makeAuthorization({ status: "authorized", id: "BR-OTHER" }) }),
    "AUTHORIZED",
  );
  const result = applyTransition(state, "PREFLIGHT", "implementation_agent");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_PHASE_MISMATCH");
});

test("applyTransition against a fixture with genuinely active, correctly-scoped authorization succeeds", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "authorized" }) }), "AUTHORIZED");
  const result = applyTransition(state, "PREFLIGHT", "implementation_agent");
  assert.equal(result.ok, true);
});

test("at least one other forward-progress authorization-gated transition is spot-checked (PREFLIGHT -> IMPLEMENTING)", () => {
  const state = withLifecycle(
    makeState({ authorization: makeAuthorization({ status: "completed" }) }),
    "PREFLIGHT",
  );
  const result = applyTransition(state, "IMPLEMENTING", "implementation_agent");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
});

test("resume-bypass closure: CORRECTION_REQUIRED -> IMPLEMENTING with revoked authorization fails with AUTHORIZATION_REVOKED, not a successful resume", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "revoked" }) }), "CORRECTION_REQUIRED");
  const result = applyTransition(state, "IMPLEMENTING", "implementation_agent");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_REVOKED");
});

test("at least one BLOCKED -> X return is spot-checked: revoked authorization blocks the resume", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "revoked" }) }), "BLOCKED");
  const result = applyTransition(state, "IMPLEMENTING", "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_REVOKED");
});

test("BLOCKED -> IMPLEMENTING and CORRECTION_REQUIRED -> IMPLEMENTING both succeed when authorization is genuinely active and phase-matching", () => {
  const authorization = makeAuthorization({ status: "authorized" });

  const blockedState = withLifecycle(makeState({ authorization }), "BLOCKED");
  const r1 = applyTransition(blockedState, "IMPLEMENTING", "human_owner");
  assert.equal(r1.ok, true);

  const correctionState = withLifecycle(makeState({ authorization }), "CORRECTION_REQUIRED");
  const r2 = applyTransition(correctionState, "IMPLEMENTING", "implementation_agent");
  assert.equal(r2.ok, true);
});

test("at least one non-gated transition succeeds even when authorization is completed/revoked (PENDING_REVIEW -> REVIEW_APPROVED)", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "revoked" }) }), "PENDING_REVIEW");
  const result = applyTransition(state, "REVIEW_APPROVED", "independent_reviewer");
  assert.equal(result.ok, true);
});

test("a BLOCKED/CORRECTION_REQUIRED entry edge is unaffected by authorization state (PREFLIGHT -> BLOCKED)", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "completed" }) }), "PREFLIGHT");
  const result = applyTransition(state, "BLOCKED", "implementation_agent");
  assert.equal(result.ok, true);
});

void ((): LifecycleState => "IDEA")();
