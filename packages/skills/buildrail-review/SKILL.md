---
name: buildrail-review
description: Independently review implemented work at an exact candidate SHA across the SPEC, SAFETY, QUALITY, and SCOPE axes.
---

# BuildRail Review

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this to move work from `PENDING_REVIEW` to `REVIEW_APPROVED` (or back
to `CORRECTION_REQUIRED`) in `docs/STATE_MACHINE.md`.

## Precondition

The reviewer must not be the same agent session/identity that implemented
the work being reviewed. Self-review is not permitted under any framing —
see `docs/GOVERNANCE.md` and `docs/REVIEW_MODEL.md`.

## What this skill does

1. Confirm the exact candidate SHA under review matches what verification
   evidence (from `buildrail-verify`) was produced against. If it doesn't
   match, the evidence is stale — request re-verification rather than
   reviewing against mismatched evidence.
2. Evaluate four separate axes, per `docs/REVIEW_MODEL.md`:
   - **SPEC** — does it satisfy the active authorization?
   - **SAFETY** — were protected systems respected?
   - **QUALITY** — correctness, security, design issues?
   - **SCOPE** — was unauthorized work introduced?
3. Report findings per axis, not as a single collapsed verdict.
4. Approve only if all axes are satisfactory; otherwise return
   `CORRECTION_REQUIRED` with specific, actionable findings.

## What this skill does not do

- It does not perform human QA (a separate, human-only checkpoint).
- It does not authorize merge.

## Boundaries

A reviewer should read the actual code and evidence at the candidate SHA,
not rely on the implementer's self-description of what changed.
