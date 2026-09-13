# BR2 — Governance Engine

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Implement the core governance engine: loading and validating config/state,
and enforcing legal lifecycle transitions.

## Scope

- Config loading (`.buildrail/config.yml`) with schema validation
- State loading (`.buildrail/state.yml`) with schema validation
- Lifecycle transition validation against `docs/STATE_MACHINE.md`
- Policy checks for authorization scope (not yet Git-aware)

## Out of Scope

- Git inspection (BR3)
- Quality gate execution (BR4)
- Agent skills (BR5)
- Adapters (BR6, BR7)

## Expected Deliverables

- `packages/core/src/config` — schema-validated config loading
- `packages/core/src/state` — schema-validated state loading
- `packages/core/src/lifecycle` — legal transition enforcement
- `packages/core/src/policy` — authorization scope checks
- CLI commands from BR1 begin using real validation instead of raw
  printing

## Entry Conditions

- BR1 reviewed, approved, and authorized as a base
- BR2 explicitly authorized by the human owner

## Exit Conditions

- Config/state loading rejects invalid documents
- Illegal lifecycle transitions are rejected
- Independent review and human approval of BR2

## Dependencies

- BR1 (CLI surface to expose this through)
