# Handoffs

A handoff is a structured artifact produced when work passes from one
agent session to another, or from an agent to a human, so that context
isn't lost or reconstructed from memory.

## Why ad hoc summaries aren't enough

A chat-style summary at the end of a session is easy to produce but easy
to get subtly wrong, and has no fixed shape a downstream reader (human or
agent) can rely on. BuildRail instead defines a structured handoff
document with required fields, so the next party knows exactly what to
check rather than having to infer it from prose.

## What a handoff anticipates recording

Per the draft `packages/core/schemas/handoff.schema.json`:

- `authorization_id` — which authorization this work falls under
- `lifecycle_state` — the current state at handoff time
- `branch` — the branch the work lives on
- `candidate_sha` — the exact commit being handed off (see
  `docs/concepts/candidate-sha.md`)
- `completed_work` — what has actually been done
- `remaining_work` — what has not
- `blockers` — anything preventing progress
- `next_authorized_action` — what the next party is actually allowed to do
  next, given current authorization — not just what seems logical

## Relationship to authorization

A handoff does not itself grant authorization. `next_authorized_action`
describes what's already authorized and next in sequence — if the next
logical step would require authorization that doesn't yet exist, the
handoff should say so rather than implying it's clear to proceed.

## Status

No handoff-generating tooling exists yet. This document describes the
target model; implementation is planned for BR5 (`buildrail-handoff`
skill) and BR4/BR1 (`buildrail handoff` CLI command).
