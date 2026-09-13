# Adapters

Adapters translate BuildRail's canonical, provider-neutral governance and
skills (see `packages/core`, `packages/skills`) into the specific
mechanisms a given coding agent product expects. See
`docs/ADAPTER_MODEL.md` for the full model.

- [`claude-code/`](claude-code/) — Claude Code adapter
- [`codex/`](codex/) — Codex adapter
- [`generic-agent-skills/`](generic-agent-skills/) — minimal, provider-agnostic packaging for any tool that consumes plain Agent Skills

## Status

All adapters are placeholders as of BR0. No installation, packaging, or
translation logic is implemented. Claude Code adapter implementation is
planned for BR6; Codex adapter for BR7.

## Principle

BuildRail Core must remain agent-provider-neutral. Adapters exist so that
provider-specific detail never has to leak into `packages/core` or
`packages/skills`.
