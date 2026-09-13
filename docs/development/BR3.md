# BR3 — Git Inspection

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Give BuildRail deterministic, factual knowledge of Git repository state, so
later phases can bind evidence and policy decisions to reality rather than
agent self-report.

## Scope

- Branch detection
- HEAD SHA and remote SHA detection
- Working tree status inspection
- Diff inspection between two refs/SHAs
- Protected-path detection (matching config-declared protected systems)
- Deletion detection
- Rename detection

## Out of Scope

- Quality gate execution (BR4)
- Evidence report generation (BR4)
- Agent skills (BR5)
- Adapters (BR6, BR7)

## Expected Deliverables

- `packages/core/src/git` — functions for the facts listed in Scope
- Policy (BR2) can consult Git inspection to evaluate protected-system
  rules against real changed paths

## Entry Conditions

- BR2 reviewed, approved, and authorized as a base
- BR3 explicitly authorized by the human owner

## Exit Conditions

- Git facts (branch, SHAs, working tree, diff, protected paths, deletions,
  renames) can be read deterministically for a real repository
- Independent review and human approval of BR3

## Dependencies

- BR2 (config/state/policy to check Git facts against)
