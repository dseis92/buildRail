---
name: buildrail-completion
description: Confirm a reviewed, human-QA'd unit of work is ready to record as merged/production-verified, without self-authorizing the merge.
---

# BuildRail Completion

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this after `HUMAN_QA` has passed, to help move work through
`MERGE_AUTHORIZED` → `MERGED` → `PRODUCTION_VERIFIED` → (optionally)
`FROZEN` in `docs/STATE_MACHINE.md`.

## What this skill does

1. Confirm review approval and human QA both exist and refer to the same
   candidate SHA that is about to be merged. If the SHA has moved since
   either, treat them as stale (see `docs/concepts/candidate-sha.md`) and
   stop.
2. Record the merge and, once production reality is confirmed, the
   `PRODUCTION_VERIFIED` state, updating `.buildrail/state.yml` to reflect
   actual fact.
3. If the human owner directs that the merged system should now be
   protected, help record the appropriate protection level (see
   `docs/PROTECTED_SYSTEMS.md`) — but freezing itself is a human decision.

## What this skill does not do

- It does not authorize the merge — `MERGE_AUTHORIZED` is a human-owner
  transition (see `docs/GOVERNANCE.md`).
- It does not freeze anything on its own initiative.

## Boundaries

Completion is a recording and confirmation activity, not a decision-making
one. Every state transition it touches (`MERGE_AUTHORIZED`, `FROZEN`)
belongs to the human owner.
