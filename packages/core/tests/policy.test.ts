import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAuthorizationActive,
  getActiveAuthorization,
  checkImplementationAllowed,
} from "@buildrail/core";
import { makeState, makeAuthorization } from "./helpers/state-fixture.js";

test("authorized-status record is accepted as active", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "authorized" }) });
  assert.equal(isAuthorizationActive(state), true);
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, true);
});

test("in_progress-status record is accepted as active", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "in_progress" }) });
  assert.equal(isAuthorizationActive(state), true);
});

test("completed-status record is rejected as active (AUTHORIZATION_INACTIVE)", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "completed" }) });
  assert.equal(isAuthorizationActive(state), false);
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
});

test("revoked-status record produces AUTHORIZATION_REVOKED specifically, not AUTHORIZATION_INACTIVE", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "revoked" }) });
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_REVOKED");
});

test("draft-status record is rejected as active (AUTHORIZATION_INACTIVE)", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "draft" }) });
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_INACTIVE");
});

test("no authorization present: isAuthorizationActive false, getActiveAuthorization null, checkImplementationAllowed AUTHORIZATION_MISSING", () => {
  const state = makeState();
  assert.equal(isAuthorizationActive(state), false);
  assert.equal(getActiveAuthorization(state), null);
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_MISSING");
});

test("active authorization whose id does not match the requested phase is rejected (AUTHORIZATION_PHASE_MISMATCH)", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "authorized", id: "BR9" }) });
  const result = checkImplementationAllowed(state, "BR10");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_PHASE_MISMATCH");
});

test("granted_by !== 'human' is rejected (AUTHORIZATION_MISSING) even if status is otherwise authorized", () => {
  const state = makeState({ authorization: makeAuthorization({ status: "authorized", granted_by: "agent" }) });
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_MISSING");
});

test("check order: a record simultaneously revoked AND missing specification still produces AUTHORIZATION_REVOKED", () => {
  const state = makeState({
    authorization: makeAuthorization({ status: "revoked", specification: "" }),
  });
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AUTHORIZATION_REVOKED");
});

test("getActiveAuthorization returns the record when active, null otherwise", () => {
  const active = makeState({ authorization: makeAuthorization({ status: "authorized" }) });
  assert.notEqual(getActiveAuthorization(active), null);

  const inactive = makeState({ authorization: makeAuthorization({ status: "completed" }) });
  assert.equal(getActiveAuthorization(inactive), null);
});

test("isAuthorizationActive, getActiveAuthorization, and checkImplementationAllowed have distinct return shapes for the same missing-authorization state", () => {
  const state = makeState();
  assert.equal(typeof isAuthorizationActive(state), "boolean");
  assert.equal(getActiveAuthorization(state), null);
  const result = checkImplementationAllowed(state, "BR9");
  assert.equal(typeof result, "object");
  assert.equal(result.ok, false);
});
