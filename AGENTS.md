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
`.buildrail/state.yml`). **No implementation phase is currently
authorized.** BR1–BR8 are planning only — do not begin implementation on
them. See `docs/ROADMAP.md` and `docs/development/` for what each phase
covers.

For the full governance model, see `docs/GOVERNANCE.md`.
