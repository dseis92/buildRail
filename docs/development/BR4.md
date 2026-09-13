# BR4 — Verification

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Implement candidate-SHA-bound verification: running quality gates and
producing evidence reports per `docs/QUALITY_GATES.md` and
`docs/concepts/evidence.md`.

## Scope

- Quality gate command execution
- Candidate-bound verification (result tied to exact SHA, branch, command,
  timestamp)
- `buildrail verify` CLI command
- Evidence report generation matching
  `packages/core/schemas/verification-report.schema.json`

## Out of Scope

- Agent skills (BR5)
- Adapters (BR6, BR7)
- Independent review tooling beyond evidence generation itself

## Expected Deliverables

- `packages/core/src/verification` — quality gate execution and evidence
  binding
- `packages/cli/src/commands/verify.ts` becomes functional
- Verification reports written to `.buildrail/reports/`

## Entry Conditions

- BR3 reviewed, approved, and authorized as a base
- BR4 explicitly authorized by the human owner

## Exit Conditions

- `buildrail verify` produces a real evidence report bound to the current
  candidate SHA
- Stale-evidence detection works when the SHA changes after verification
- Independent review and human approval of BR4

## Dependencies

- BR3 (Git inspection to determine candidate SHA and detect protected-path
  changes/deletions/renames for the report)
