# BR5 — Agent Skills

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Turn the design-draft skills in `packages/skills/` into skills backed by
real BuildRail CLI behavior (BR1–BR4), so agent workflow instructions are
enforced rather than just documented.

## Scope

- Planning skill
- Preflight skill
- Implementation skill
- Verification skill
- Review skill
- Completion skill
- Handoff skill

## Out of Scope

- Provider-specific packaging (BR6, BR7)
- End-to-end dogfood run (BR8)

## Expected Deliverables

- Updated `packages/skills/*/SKILL.md` files with the
  "STATUS: DESIGN DRAFT" marker removed once backed by real CLI behavior
- Each skill instructs an agent to use real `buildrail` commands from
  BR1–BR4 rather than describing hypothetical behavior

## Entry Conditions

- BR4 reviewed, approved, and authorized as a base
- BR5 explicitly authorized by the human owner

## Exit Conditions

- Each of the seven skills reflects real, working CLI behavior
- Independent review and human approval of BR5

## Dependencies

- BR1–BR4 (the CLI commands and governance engine skills instruct agents
  to use)
