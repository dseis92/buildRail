# BR2 — Governance Engine

**Status: COMPLETE + INDEPENDENTLY APPROVED + FROZEN**

BR2 is complete, independently reviewed, approved, and frozen at approved
candidate `720abf34d80933714475ec56ab43fd39fa82f484`
(`.buildrail/state.yml`: `baselines.BR2`). `@buildrail/core`'s
provider-neutral governance engine — config/state loading, schema
validation, authorization policy, and the lifecycle transition engine —
is real and wired into `buildrail status` output.

See `.buildrail/specs/BR2-GOVERNANCE-ENGINE.md` for the detailed BR2
specification (architectural boundary, config/state loading contracts,
schema registry and `$ref` resolution strategy, active/historical
authorization semantics, lifecycle engine, CLI integration, error model,
dependency proposals, test architecture, and acceptance criteria). That
document is the authoritative BR2 specification; this page remains a
short summary. This governance activation does not itself change or
reinterpret that specification's architecture or contracts in any way.

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

- BR1 reviewed, approved, and authorized as a base — **satisfied** (BR1
  complete, independently approved, Human-QA-passed, merged, and frozen)
- BR2 explicitly authorized by the human owner — **satisfied**

## Exit Conditions

- Config/state loading rejects invalid documents — **satisfied**
- Illegal lifecycle transitions are rejected — **satisfied**
- Independent review and human approval of BR2 — **satisfied** (approved
  candidate `720abf34d80933714475ec56ab43fd39fa82f484`, frozen)

## Dependencies

- BR1 (CLI surface to expose this through)

## Deferred from BR0 review — resolved at specification level

The independent BR0 review flagged that
`packages/core/schemas/state.schema.json`'s `authorization` property uses
`"$ref": "authorization.schema.json"` — a bare relative reference that
requires a schema loader to register both files under a shared base
URI/registry to resolve correctly. The detailed BR2 specification
(`.buildrail/specs/BR2-GOVERNANCE-ENGINE.md` §11) resolves this with a
concrete schema-registry `$ref`-resolution strategy. Actually implementing
that strategy remains BR2 implementation work, not yet performed.
