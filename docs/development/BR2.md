# BR2 — Governance Engine

**Status: AUTHORIZED — IMPLEMENTATION NOT STARTED**

The BR2 specification was independently reviewed and approved at
candidate `d5a8a8762daf90d7ea628faa8be55b272e12c03b`, merged via
`2c0fc991e9df15025f19e761ab27dddf917fe61d`. The human owner has since
granted implementation authorization (`.buildrail/state.yml`:
`current.lifecycle_state: AUTHORIZED`, `current.development_phase: BR2`).
**Implementation has not yet started** — the next required step is BR2
preflight, followed by implementation, verification, independent review,
and human QA.

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
  (`.buildrail/state.yml`: `authorization.id: BR2`, `status: authorized`)

## Exit Conditions

- Config/state loading rejects invalid documents
- Illegal lifecycle transitions are rejected
- Independent review and human approval of BR2

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
