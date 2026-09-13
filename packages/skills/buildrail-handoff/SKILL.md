---
name: buildrail-handoff
description: Produce a structured handoff artifact when work must pass between agent sessions or from an agent to a human, without losing context.
---

# BuildRail Handoff

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this whenever a session is ending before the full lifecycle for a unit
of work is complete — regardless of which lifecycle state the work is
currently in.

## What this skill does

1. Read `.buildrail/state.yml` for the current lifecycle state, active
   authorization, and candidate info.
2. Produce a handoff artifact containing, at minimum: `authorization_id`,
   `lifecycle_state`, `branch`, `candidate_sha`, `completed_work`,
   `remaining_work`, `blockers`, and `next_authorized_action` — see
   `packages/core/schemas/handoff.schema.json` and
   `docs/concepts/handoffs.md`.
3. `next_authorized_action` must describe what is actually authorized to
   happen next, not merely what seems like the logical next step. If the
   logical next step requires authorization that doesn't exist yet, say
   so explicitly instead of implying it's already covered.

## What this skill does not do

- It does not grant authorization for future work.
- It does not summarize from memory in place of checking
  `.buildrail/state.yml` and real repository state.

## Boundaries

A handoff should let the next reader (human or agent) pick up correctly
without needing to re-derive context from chat history.
