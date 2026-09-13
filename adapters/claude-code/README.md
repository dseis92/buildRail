# Claude Code Adapter

**Status: placeholder (BR0). Implementation planned for BR6.**

## Intended future responsibilities

- Install BuildRail's canonical skills (`packages/skills/`) in whatever
  form Claude Code expects (e.g. as Claude Code skills/plugins).
- Expose BuildRail governance instructions to Claude Code sessions,
  pointing back to `.buildrail/` as canonical state and config rather than
  duplicating it.
- Keep `CLAUDE.md` a thin pointer, not a second source of truth. BuildRail
  state and policy live in `.buildrail/`; `CLAUDE.md` should tell Claude
  Code to read them, not restate them.

## What this adapter does not do

- It does not implement governance logic. That lives in `packages/core`
  and must remain usable by any adapter, not just this one.
- It does not become the project's database. If `.buildrail/state.yml`
  and `CLAUDE.md` ever disagree, `.buildrail/state.yml` wins (see
  `docs/GOVERNANCE.md`'s source-of-truth hierarchy).

## Contents

- [`templates/CLAUDE.md`](templates/CLAUDE.md) — draft template for
  BuildRail-governed projects using Claude Code
- [`plugin/`](plugin/) — placeholder for future Claude Code plugin
  packaging
