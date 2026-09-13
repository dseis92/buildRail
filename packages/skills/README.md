# @buildrail/skills

Canonical, provider-neutral BuildRail agent skill definitions.

## Status

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

Each `SKILL.md` in this directory documents intended workflow behavior. As
of BR0, none of them are backed by real `buildrail` CLI commands — those
commands don't exist yet (see `docs/ROADMAP.md`). They will become
functional starting in BR5, once BR1–BR4 provide real CLI/governance
behavior for them to invoke.

## Skills

- [`buildrail-plan/`](buildrail-plan/) — turning an idea into a specification
- [`buildrail-preflight/`](buildrail-preflight/) — validating readiness before implementation
- [`buildrail-implement/`](buildrail-implement/) — implementing authorized work
- [`buildrail-verify/`](buildrail-verify/) — running quality gates and producing evidence
- [`buildrail-review/`](buildrail-review/) — independent review
- [`buildrail-completion/`](buildrail-completion/) — marking work complete
- [`buildrail-handoff/`](buildrail-handoff/) — structured handoff between sessions

## Provider neutrality

These skills describe canonical behavior once. Provider-specific packaging
(Claude Code, Codex, or other agent tooling) lives in `adapters/`, not
here. See `docs/ADAPTER_MODEL.md`.
