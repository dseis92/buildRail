# BR6 — Claude Code Adapter

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Package BuildRail's canonical skills (BR5) for use with Claude Code,
without leaking Claude-specific logic into BuildRail Core.

## Scope

- Claude Code skill installation packaging
- `CLAUDE.md` template that points to `.buildrail/` as canonical state
  rather than duplicating it
- Claude Code plugin packaging, if applicable

## Out of Scope

- Codex adapter (BR7)
- Changes to BuildRail Core governance logic

## Expected Deliverables

- Functional content under `adapters/claude-code/` (templates, plugin
  packaging) replacing the BR0 placeholders
- Verification that Claude Code can consume BuildRail skills as intended

## Entry Conditions

- BR5 reviewed, approved, and authorized as a base
- BR6 explicitly authorized by the human owner

## Exit Conditions

- Claude Code can be pointed at a BuildRail-governed project and follow
  BuildRail skills correctly
- Independent review and human approval of BR6

## Dependencies

- BR5 (canonical skills to adapt)
