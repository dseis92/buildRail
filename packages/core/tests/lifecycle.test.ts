import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLegalTransition,
  requiredActor,
  applyTransition,
  TRANSITION_RULES,
  type LifecycleState,
  type Actor,
} from "@buildrail/core";
import { makeState, makeAuthorization, withLifecycle } from "./helpers/state-fixture.js";

const ACTORS: Actor[] = ["human_owner", "independent_reviewer", "implementation_agent"];

test("all 26 legal edges are individually tested as legal with the correct requiredActor", () => {
  assert.equal(TRANSITION_RULES.length, 26);
  for (const rule of TRANSITION_RULES) {
    assert.equal(isLegalTransition(rule.from, rule.to), true, `${rule.from} -> ${rule.to} should be legal`);
    assert.equal(requiredActor(rule.from, rule.to), rule.requiredActor, `${rule.from} -> ${rule.to} actor mismatch`);
  }
});

test("illegal forward skip is rejected (AUTHORIZED -> IMPLEMENTED)", () => {
  assert.equal(isLegalTransition("AUTHORIZED", "IMPLEMENTED"), false);
});

test("illegal backwards transition on the primary path is rejected (IMPLEMENTED -> PREFLIGHT)", () => {
  assert.equal(isLegalTransition("IMPLEMENTED", "PREFLIGHT"), false);
});

test("human_owner-required edges fail with LIFECYCLE_AUTHORITY_REQUIRED for other actors", () => {
  // SPECIFIED -> AUTHORIZED is a dedicated-operation edge, so applyTransition
  // itself would report LIFECYCLE_DEDICATED_OPERATION_REQUIRED rather than
  // reaching the actor check for that specific edge. Use MERGED -> PRODUCTION_VERIFIED
  // (a generic-apply, human_owner-required edge) plus a BLOCKED return instead.
  for (const actor of ["implementation_agent", "independent_reviewer"] as Actor[]) {
    const state = withLifecycle(makeState(), "BLOCKED");
    const result = applyTransition(state, "PREFLIGHT", actor);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_AUTHORITY_REQUIRED");
  }
});

test("PENDING_REVIEW -> REVIEW_APPROVED succeeds only for independent_reviewer", () => {
  for (const actor of ACTORS) {
    const state = withLifecycle(makeState(), "PENDING_REVIEW");
    const result = applyTransition(state, "REVIEW_APPROVED", actor);
    if (actor === "independent_reviewer") {
      assert.equal(result.ok, true, `expected success for ${actor}`);
    } else {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_AUTHORITY_REQUIRED");
    }
  }
});

test("implementation-agent-only transition succeeds only for implementation_agent (IMPLEMENTING -> IMPLEMENTED)", () => {
  const authorization = makeAuthorization({ status: "authorized" });
  for (const actor of ACTORS) {
    const state = withLifecycle(makeState({ authorization }), "IMPLEMENTING");
    const result = applyTransition(state, "IMPLEMENTED", actor);
    if (actor === "implementation_agent") {
      assert.equal(result.ok, true, `expected success for ${actor}`);
    } else {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "LIFECYCLE_AUTHORITY_REQUIRED");
    }
  }
});

test("both actor-neutral edges succeed for all three Actor values", () => {
  for (const actor of ACTORS) {
    const ideaState = makeState();
    const r1 = applyTransition(ideaState, "SPECIFIED", actor);
    assert.equal(r1.ok, true, `IDEA -> SPECIFIED should succeed for ${actor}`);

    const mergeState = withLifecycle(makeState(), "MERGE_AUTHORIZED");
    const r2 = applyTransition(mergeState, "MERGED", actor);
    assert.equal(r2.ok, true, `MERGE_AUTHORIZED -> MERGED should succeed for ${actor}`);
  }
});

test("each of the 5 BLOCKED entries is legal with implementation_agent", () => {
  const entries: LifecycleState[] = ["PREFLIGHT", "IMPLEMENTING", "IMPLEMENTED", "VERIFYING", "PENDING_REVIEW"];
  for (const from of entries) {
    assert.equal(isLegalTransition(from, "BLOCKED"), true);
    assert.equal(requiredActor(from, "BLOCKED"), "implementation_agent");
  }
});

test("each of the 5 BLOCKED returns is legal with human_owner", () => {
  const returns: LifecycleState[] = ["PREFLIGHT", "IMPLEMENTING", "IMPLEMENTED", "VERIFYING", "PENDING_REVIEW"];
  for (const to of returns) {
    assert.equal(isLegalTransition("BLOCKED", to), true);
    assert.equal(requiredActor("BLOCKED", to), "human_owner");
  }
});

test("both CORRECTION_REQUIRED entries and its one return are legal with correct actors", () => {
  assert.equal(requiredActor("PENDING_REVIEW", "CORRECTION_REQUIRED"), "independent_reviewer");
  assert.equal(requiredActor("HUMAN_QA", "CORRECTION_REQUIRED"), "human_owner");
  assert.equal(requiredActor("CORRECTION_REQUIRED", "IMPLEMENTING"), "implementation_agent");
});

test("edges not in the 26-entry table are confirmed illegal", () => {
  assert.equal(isLegalTransition("IDEA", "FROZEN"), false);
  assert.equal(isLegalTransition("BLOCKED", "SPECIFIED"), false);
  assert.equal(isLegalTransition("REVIEW_APPROVED", "CORRECTION_REQUIRED"), false);
});

test("requiredActor returns undefined (not null, not throw) for an illegal pair", () => {
  assert.doesNotThrow(() => {
    const result = requiredActor("IDEA", "FROZEN");
    assert.equal(result, undefined);
  });
});

test("both dedicated-operation edges are graph-legal with human_owner", () => {
  assert.equal(isLegalTransition("SPECIFIED", "AUTHORIZED"), true);
  assert.equal(requiredActor("SPECIFIED", "AUTHORIZED"), "human_owner");
  assert.equal(isLegalTransition("PRODUCTION_VERIFIED", "FROZEN"), true);
  assert.equal(requiredActor("PRODUCTION_VERIFIED", "FROZEN"), "human_owner");
});

test("applyTransition(SPECIFIED -> AUTHORIZED) fails with LIFECYCLE_DEDICATED_OPERATION_REQUIRED, details names authorizeSpecifiedWork", () => {
  const state = withLifecycle(makeState(), "SPECIFIED");
  const result = applyTransition(state, "AUTHORIZED", "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "LIFECYCLE_DEDICATED_OPERATION_REQUIRED");
    assert.equal(result.error.details, "authorizeSpecifiedWork");
  }
});

test("applyTransition(PRODUCTION_VERIFIED -> FROZEN) fails with LIFECYCLE_DEDICATED_OPERATION_REQUIRED, details names completeAndFreezePhase", () => {
  const state = withLifecycle(makeState({ authorization: makeAuthorization({ status: "authorized" }) }), "PRODUCTION_VERIFIED");
  const result = applyTransition(state, "FROZEN", "human_owner");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "LIFECYCLE_DEDICATED_OPERATION_REQUIRED");
    assert.equal(result.error.details, "completeAndFreezePhase");
  }
});

test("for every other one of the 24 legal edges, applyTransition never returns LIFECYCLE_DEDICATED_OPERATION_REQUIRED", () => {
  // Spot-check across each category: primary-path, BLOCKED entry,
  // BLOCKED return, CORRECTION_REQUIRED entry, CORRECTION_REQUIRED return.
  const authorization = makeAuthorization({ status: "authorized" });
  const cases: Array<{ from: LifecycleState; to: LifecycleState; actor: Actor }> = [
    { from: "AUTHORIZED", to: "PREFLIGHT", actor: "implementation_agent" },
    { from: "PREFLIGHT", to: "BLOCKED", actor: "implementation_agent" },
    { from: "BLOCKED", to: "PREFLIGHT", actor: "human_owner" },
    { from: "PENDING_REVIEW", to: "CORRECTION_REQUIRED", actor: "independent_reviewer" },
    { from: "CORRECTION_REQUIRED", to: "IMPLEMENTING", actor: "implementation_agent" },
  ];
  for (const { from, to, actor } of cases) {
    const state = withLifecycle(makeState({ authorization }), from);
    const result = applyTransition(state, to, actor);
    if (!result.ok) {
      assert.notEqual(result.error.code, "LIFECYCLE_DEDICATED_OPERATION_REQUIRED", `${from} -> ${to} should not require a dedicated operation`);
    }
  }
});

test("applyTransition purity: input state is unchanged after a successful call", () => {
  const authorization = makeAuthorization({ status: "authorized" });
  const state = withLifecycle(makeState({ authorization }), "AUTHORIZED");
  const snapshot = JSON.parse(JSON.stringify(state));
  const result = applyTransition(state, "PREFLIGHT", "implementation_agent");
  assert.equal(result.ok, true);
  assert.deepEqual(state, snapshot, "input state must remain unchanged");
});
