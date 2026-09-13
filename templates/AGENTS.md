# AGENTS.md

<PROJECT_NAME> is governed by BuildRail.

## Before doing anything

1. Read `.buildrail/state.yml` and `.buildrail/config.yml`.
2. Identify the current `lifecycle_state`, `development_phase` (if
   applicable), and active authorization.
3. Work only within that authorization. If it's unclear what is
   authorized, **STOP** and ask the human owner.

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
- If authorization is unclear or insufficient for the work at hand, STOP
  and report what's blocking you rather than proceeding on assumption.

## Current authorization

See `.buildrail/state.yml` for the currently active authorization
(`<AUTHORIZATION_ID>` at the time this file was generated).
