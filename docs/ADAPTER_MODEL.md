# Adapter Model

BuildRail supports multiple coding agents without letting any one of them
shape its core governance logic. This document describes the intended
model. **No adapter is implemented as of BR0** (Claude Code adapter planned
for BR6, Codex adapter for BR7).

## Provider neutrality

**BuildRail Core must remain agent-provider-neutral.** Core has no
knowledge of Claude Code, Codex, or any other specific tool — only of
lifecycle states, authorization, protected systems, Git facts, and
verification evidence, all defined in provider-agnostic terms
(`.buildrail/*.yml`, JSON Schemas, plain Git operations).

## Adapters, not integrations baked into core

Claude Code and Codex are **adapters** — thin translation layers that sit
on top of BuildRail Core and Skills, not special cases inside them.

- **Claude Code adapter** (`adapters/claude-code/`) — installs BuildRail
  skills in whatever form Claude Code expects, and surfaces governance
  instructions (e.g. via a `CLAUDE.md` template) that point back to
  `.buildrail/` as the canonical source of truth rather than duplicating
  it.
- **Codex adapter** (`adapters/codex/`) — exposes the same canonical
  skills as Agent Skills for Codex, with optional provider metadata (e.g.
  an `agents/openai.yaml`-style file), again pointing back to
  `.buildrail/` rather than restating it.
- **Generic agent skills adapter** (`adapters/generic-agent-skills/`) — a
  minimal, provider-agnostic packaging of the same skills for any other
  tool that can consume plain Agent Skills.

## Canonical skill behavior

Skill *behavior* (what "plan," "preflight," "implement," "verify,"
"review," "complete," and "handoff" mean) is defined once, canonically, in
`packages/skills/`. Adapters translate packaging and invocation mechanics
for a specific provider; they should not redefine what a skill does.
Provider-specific metadata (file formats, front matter conventions,
installation steps) belongs only in the adapter/plugin layer.

## Why this matters

This separation is what lets BuildRail add support for a future coding
agent without rewriting governance logic, and what prevents BuildRail from
becoming implicitly Claude-only or Codex-only. A contribution that makes
Core assume a specific provider's behavior is a violation of this model
regardless of how useful it is for that one provider — see
`CONTRIBUTING.md`.

## Status

`adapters/claude-code/` and `adapters/codex/` currently contain only
placeholder READMEs and template stubs. No installation logic, plugin
packaging, or skill translation has been implemented.
