# BR8 — End-to-End Dogfood

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Prove the full BuildRail lifecycle works by using BuildRail to govern its
own ongoing development, and by running a reference demo application
through the complete lifecycle.

## Scope

- Govern BuildRail's own subsequent development using BuildRail itself
  (real `.buildrail/` state, real authorizations, real candidate SHAs)
- Build and govern a reference demo application from idea through
  `PRODUCTION_VERIFIED`
- Full lifecycle test: `IDEA` → ... → `FROZEN`, exercising every state,
  every quality gate, independent review, and human QA for real

## Out of Scope

- New BuildRail Core features not already delivered by BR1–BR7
- Additional adapters beyond Claude Code and Codex

## Expected Deliverables

- Evidence that BuildRail's own repository is governed under its own
  `.buildrail/` state through a real phase (not just BR0's foundational
  scaffolding)
- A reference demo application (see `examples/`) taken through the full
  lifecycle with real authorizations, verification, review, and QA
- A written retrospective of what worked and what didn't

## Entry Conditions

- BR1–BR7 reviewed, approved, and authorized as a base
- BR8 explicitly authorized by the human owner

## Exit Conditions

- At least one real unit of work has passed through every lifecycle state
  under real BuildRail enforcement
- Independent review and human approval of BR8

## Dependencies

- BR1–BR7 (the entire stack this phase proves out end to end)
