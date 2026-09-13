# Getting Started (target v0.1 experience)

**Status: none of this is implemented yet.** BuildRail is currently in BR0
(Constitution) — there is no functional CLI. This guide describes the
intended v0.1 experience so contributors can build toward a consistent
target, not a set of commands you can run today.

## The intended flow

1. `buildrail init` — set up `.buildrail/` in your project (config, state,
   spec/decision/report directories).
2. `buildrail new` — describe an idea and turn it into a specification.
3. Review the specification, then authorize it (`buildrail authorize`).
4. Point a coding agent (Claude Code, Codex, or another supported agent) at
   the authorized work.
5. The agent runs preflight (`buildrail preflight`), implements the work,
   and requests verification (`buildrail verify`).
6. An independent reviewer evaluates the work at the exact candidate SHA.
7. You perform human QA.
8. You authorize the merge.
9. BuildRail tracks the merged, production-verified result, and can freeze
   it if appropriate.

## What exists today (BR0)

- The governance model and specification documents in `docs/`
- `.buildrail/config.yml` and `.buildrail/state.yml` describing policy and
  state, currently reflecting BuildRail's own BR0 status
- Draft schemas in `packages/core/schemas/`
- Placeholder package/CLI/skill/adapter structure with no functional code

See `docs/ROADMAP.md` for what each future phase adds.
