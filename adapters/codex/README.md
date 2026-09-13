# Codex Adapter

**Status: placeholder (BR0). Implementation planned for BR7.**

## Intended future responsibilities

- Expose BuildRail's canonical skills (`packages/skills/`) as Codex Agent
  Skills.
- Optionally provide Codex-specific metadata (e.g. an
  `agents/openai.yaml`-style file) if Codex's tooling benefits from it.
- Keep BuildRail Core provider-neutral — this adapter translates and
  packages; it does not redefine governance behavior.

## What this adapter does not do

- It does not implement governance logic. That lives in `packages/core`.
- It does not duplicate `.buildrail/state.yml`/`config.yml` content into
  Codex-specific files as a second source of truth.

## Contents

- [`templates/AGENTS.md`](templates/AGENTS.md) — draft template for
  BuildRail-governed projects using Codex
- [`plugin/`](plugin/) — placeholder for future Codex packaging
