# BR3 — Git Inspection

**Status: AUTHORIZED — IMPLEMENTATION NOT STARTED**

The BR3 specification was independently reviewed and approved (approved
candidate `c3996dd6b764bfd2246277e92e3bef03e84179dc`). The human owner
has since granted implementation authorization (`.buildrail/state.yml`:
`current.lifecycle_state: AUTHORIZED`, `current.development_phase: BR3`).
The specification/activation pull request (PR #11) is still **open,
pending merge**. **Implementation has not yet started** — the next
required steps are merging PR #11, then the `AUTHORIZED` → `PREFLIGHT`
governance transition (a separate commit, on a dedicated implementation
branch created from the post-merge `main` baseline — the same sequencing
BR2 followed), followed by implementation, verification, independent
review, and human QA.

See `.buildrail/specs/BR3-GIT-INSPECTION.md` for the detailed BR3
specification (repository-root semantics, branch/HEAD/upstream model,
working-tree and diff inspection, protected-path matching, process
execution safety, determinism, error model, dependency policy, test
architecture, and acceptance criteria). That document is the
authoritative BR3 specification; this page remains a short summary.
This governance activation does not itself change or reinterpret that
specification's architecture or contracts in any way.

## Goal

Give BuildRail deterministic, factual knowledge of Git repository state, so
later phases can bind evidence and policy decisions to reality rather than
agent self-report.

## Scope

- Branch detection
- HEAD SHA and configured upstream identity/object-ref resolution
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

- BR2 reviewed, approved, and authorized as a base — **satisfied** (BR2
  complete, independently approved, merged, and frozen)
- BR3 explicitly authorized by the human owner — **satisfied**
  (`.buildrail/state.yml`: `authorization.id: BR3`, `status: authorized`)

## Exit Conditions

- Git facts (branch, SHAs, working tree, diff, protected paths, deletions,
  renames) can be read deterministically for a real repository
- Independent review and human approval of BR3

## Dependencies

- BR2 (config/state/policy to check Git facts against)
