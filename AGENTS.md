# AGENTS.md

BuildRail governs this repository. This file is a short entry point, not
the governance model itself.

## Before doing anything

1. Read `.buildrail/state.yml` and `.buildrail/config.yml`.
2. Identify the current `lifecycle_state`, `development_phase`, and active
   authorization.
3. Work only within that authorization. If it's unclear what is authorized,
   **STOP** and ask the human owner.

## Rules

- The human repository owner has final authority over scope, approval, and
  merge decisions.
- Repository facts (Git state, file contents) outrank stale documentation,
  prior conversation summaries, or assumptions.
- Implementation agents may report work as `IMPLEMENTED`, but may **not**:
  - approve their own work
  - freeze anything
  - authorize their own merge
  - claim tests, verification, or results that were not actually run
  - modify frozen or locked systems without explicit authorization
  - broaden scope beyond the active authorization without saying so
- If authorization is unclear or insufficient for the work at hand, STOP and
  report what's blocking you rather than proceeding on assumption.

## Current phase

**BR0 (Constitution) is complete, independently approved, and frozen** at
baseline `04c93767510c51916fcc51f60b85b674c7d6f1cc` (see
`.buildrail/state.yml`). **BR1 (CLI Skeleton) is complete, independently
approved, Human-QA-passed, merged, and frozen** at approved candidate
`36f7b0a569eeee0cd1c5d7472cf176763c818a2e` (merged to `main` as
`3b695399eae01720804ec496e7735d636edaed41`). BuildRail now has a real,
executable `buildrail` CLI shell (`packages/cli`) — see
`.buildrail/specs/BR1-CLI-SKELETON.md`. **BR2 (Governance Engine) is now
AUTHORIZED for implementation** (`.buildrail/state.yml`:
`current.lifecycle_state: AUTHORIZED`, `current.development_phase: BR2`)
under its independently reviewed and approved specification
(`.buildrail/specs/BR2-GOVERNANCE-ENGINE.md`) — **implementation has not
yet started.** The next required step is BR2 preflight, followed by
implementation, verification, independent review, and human QA, exactly
as BR1's lifecycle proceeded. BR3–BR8 remain planning only — do not begin
implementation on any of BR3–BR8. See `docs/ROADMAP.md` and
`docs/development/` for what each phase covers.

For the full governance model, see `docs/GOVERNANCE.md`.

## Current BuildRail development roles

This section records who currently occupies BuildRail's generic governance
roles (`docs/GOVERNANCE.md`) while BuildRail itself is being developed. It
is project-specific to this repository's current development process, not
a BuildRail Core or template concept — see `docs/ADAPTER_MODEL.md` for why
BuildRail Core and canonical skills must stay provider-neutral regardless
of who currently fills these roles.

- **Human Owner:** repository owner / Dylan
- **Implementation Agent:** Claude Code
- **Independent Reviewer:** ChatGPT

Rules that follow from this assignment:

- Claude Code implements work within active authorization but does not
  independently approve its own work. Claude's completion or correction
  reports are evidence for review, not approval.
- ChatGPT performs independent review against the actual GitHub
  branch/exact candidate SHA — not against a description of changes, and
  not against Claude's own self-report.
- The human owner is the final authority: they grant implementation
  authorization, accept or reject independent review findings, authorize
  merges, and authorize movement into the next development phase.
- Claude must not claim ChatGPT approved something unless the human owner
  provides the actual ChatGPT review verdict.
- A different role assignment may be made only by explicit human-owner
  instruction, and should be recorded here when it changes.
