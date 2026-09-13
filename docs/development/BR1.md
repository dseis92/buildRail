# BR1 — CLI Skeleton

**Status: AUTHORIZED / IMPLEMENTATION NOT YET STARTED**

For the authoritative BR1 implementation contract (architectural boundary,
command behavior, build/execution model, dependency policy, testing
strategy, and acceptance criteria), see:

`.buildrail/specs/BR1-CLI-SKELETON.md`

This page remains a short summary; if the two ever disagree, the detailed
specification governs.

## Goal

Provide a minimal, working `buildrail` CLI shell and build/execution path
without implementing governance logic.

## Scope

- `buildrail --help`
- `buildrail -h`
- `buildrail help`
- `buildrail --version`
- `buildrail -v`
- `buildrail init`
- `buildrail init --help`
- `buildrail status`
- `buildrail status --help`
- command routing
- CLI error handling and exit codes
- compiled TypeScript-to-JavaScript executable
- behavioral CLI tests

## Out of Scope

- Real `buildrail init` project scaffolding
- Reading `.buildrail/state.yml`
- Reading `.buildrail/config.yml`
- YAML parsing
- Schema validation
- Governance lifecycle logic
- Authorization evaluation
- Git inspection (BR3)
- Verification (BR4)
- Any agent skill or adapter behavior (BR5–BR7)
- BR2+ implementation

## Expected Deliverables

- A working `packages/cli` entry point
- A compiled JavaScript CLI executable
- `package.json#bin` pointing to executable compiled JavaScript, not
  TypeScript source
- Functional global help (`--help`, `-h`, `help`) and command-specific
  help (`init --help`, `status --help`)
- Functional version reporting (`--version`, `-v`) sourced from package
  metadata
- `buildrail init` registered as a truthful BR1 command shell only — it
  reports that real project initialization is not implemented yet and
  does **not** create `.buildrail/`, `config.yml`, `state.yml`,
  `AGENTS.md`, skills, or adapters. Real initialization ownership belongs
  to a future phase not yet assigned.
- `buildrail status` registered as a truthful BR1 command shell only — it
  reports that state-backed status requires the future governance engine
  and does **not** read `.buildrail/state.yml` or `.buildrail/config.yml`,
  parse YAML, validate schemas, or fabricate project state.
- Clear error handling and documented exit codes
- Behavioral tests for the BR1 CLI surface
- Real, functional root-level `build`, `test`, and `typecheck` commands
  for the BR1 CLI (not BR0's placeholder echo scripts)

## Entry Conditions

- BR0 is complete, independently approved, and frozen
- The BR1 specification has been independently reviewed and approved
- BR1 implementation is explicitly authorized by the human owner

## Exit Conditions

- BR1 CLI command surface behaves according to the approved detailed
  specification
- CLI builds to executable JavaScript
- Behavioral tests pass
- Typecheck passes
- Build passes
- No governance engine or BR2+ behavior was implemented
- Independent review is complete
- Human owner accepts the phase result

## Dependencies

- BR0 (package/workspace structure)
