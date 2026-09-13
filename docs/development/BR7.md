# BR7 — Codex Adapter

**Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED**

## Goal

Package BuildRail's canonical skills (BR5) for use with Codex, without
leaking Codex-specific logic into BuildRail Core.

## Scope

- Codex Agent Skills packaging
- `AGENTS.md` template for Codex-governed projects
- Optional Codex-specific metadata (e.g. an `agents/openai.yaml`-style
  file), if needed

## Out of Scope

- Claude Code adapter (BR6, developed independently)
- Changes to BuildRail Core governance logic

## Expected Deliverables

- Functional content under `adapters/codex/` (templates, plugin packaging)
  replacing the BR0 placeholders
- Verification that Codex can consume BuildRail skills as intended

## Entry Conditions

- BR5 reviewed, approved, and authorized as a base
- BR7 explicitly authorized by the human owner

## Exit Conditions

- Codex can be pointed at a BuildRail-governed project and follow
  BuildRail skills correctly
- Independent review and human approval of BR7

## Dependencies

- BR5 (canonical skills to adapt)
