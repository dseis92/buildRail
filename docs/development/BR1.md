# BR1 — CLI Skeleton

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Provide a minimal, working `buildrail` CLI shell with no governance logic
yet — just the command surface.

## Scope

- `buildrail --help`
- `buildrail init`
- `buildrail status`

## Out of Scope

- Config/state validation logic (BR2)
- Git inspection (BR3)
- Verification (BR4)
- Any agent skill or adapter behavior (BR5–BR7)

## Expected Deliverables

- A working `packages/cli` entry point exposing the three commands above
- `buildrail init` creates a minimal `.buildrail/` structure in a target
  project
- `buildrail status` reads and prints `.buildrail/state.yml` contents
  without validating or transforming them

## Entry Conditions

- BR0 is reviewed and approved
- BR1 is explicitly authorized by the human owner

## Exit Conditions

- The three commands work as described above
- No governance logic beyond reading/printing exists yet
- Independent review and human approval of BR1

## Dependencies

- BR0 (package/workspace structure)
