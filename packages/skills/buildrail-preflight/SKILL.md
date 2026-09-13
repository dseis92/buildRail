---
name: buildrail-preflight
description: Validate that a repository is in a workable state and that a specific piece of work is actually authorized, before implementation begins.
---

# BuildRail Preflight

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this immediately before starting implementation on an authorized
specification — the transition from `AUTHORIZED` to `IMPLEMENTING` in
`docs/STATE_MACHINE.md`.

## What this skill does

1. Read `.buildrail/state.yml` and confirm `current.lifecycle_state` and
   `authorization` actually cover the work about to be done.
2. Confirm the target branch and working tree are in an expected state
   (no unexpected uncommitted changes, no unexpected divergence from the
   base branch).
3. Confirm no part of the intended work touches a `FROZEN` or `LOCKED`
   protected system without authorization naming it (see
   `docs/PROTECTED_SYSTEMS.md`).
4. If everything checks out, proceed to `IMPLEMENTING`. If not, STOP and
   report exactly what's blocking (see `docs/GOVERNANCE.md`).

## What this skill does not do

- It does not implement anything itself.
- It does not grant or expand authorization.

## Boundaries

Preflight failing is a normal, expected outcome, not an error to route
around. Report it plainly.
