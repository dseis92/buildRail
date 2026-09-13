---
name: buildrail-implement
description: Implement work that has passed preflight, strictly within the active authorization's scope, and report status honestly.
---

# BuildRail Implement

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this while actively building authorized work — the `IMPLEMENTING`
state in `docs/STATE_MACHINE.md`.

## What this skill does

1. Implement only what the active specification's in-scope section
   describes. Re-check `.buildrail/state.yml` and the specification if
   scope becomes unclear mid-implementation.
2. If the work turns out to require touching a `FROZEN`/`LOCKED` system or
   otherwise exceeds current authorization, STOP and report the exact
   affected system/path rather than proceeding (see `docs/GOVERNANCE.md`).
3. When implementation is complete, report the work as `IMPLEMENTED` —
   this is a status report, not an approval.

## What this skill does not do

- It does not approve its own work.
- It does not freeze anything.
- It does not authorize its own merge.
- It does not claim verification results it did not actually produce —
  verification is a separate skill (`buildrail-verify`).

## Boundaries

An implementation agent using this skill must never silently broaden scope
"while it's at it." Additional work belongs in a separate, explicitly
authorized specification.
