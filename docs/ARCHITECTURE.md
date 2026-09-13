# Architecture

BuildRail is organized into four conceptual layers, from human intent down
to deterministic enforcement.

```
1. Human intent          — the project owner's goals and decisions
2. Governance            — state, config, authorization, policy
3. Agent workflows       — skills that guide agent behavior
4. Deterministic enforcement — Git inspection and verification that check facts
```

Each layer depends only on the layers below it for facts, and each layer
below has no knowledge of the specific agent or tool operating above it.

## Package structure

```
BuildRail Core (packages/core)
├── State/config schemas   — the data contracts for state.yml / config.yml
├── Lifecycle               — the state machine and legal transitions
├── Policy                  — protected systems, authorization checks
├── Git inspection           — branch, SHA, working tree, diff facts
└── Verification             — quality gate execution, evidence binding

BuildRail Skills (packages/skills)
├── Plan
├── Preflight
├── Implement
├── Verify
├── Review
├── Completion
└── Handoff

Adapters (adapters/)
├── Claude Code
├── Codex
└── Generic Agent Skills

CLI (packages/cli)
└── A deterministic interface over BuildRail Core
```

## Critical principle: provider neutrality

**Provider-specific details must not leak into BuildRail Core.**

BuildRail Core has no knowledge of Claude Code, Codex, or any other
specific agent or tool. It knows about lifecycle states, authorization
records, protected systems, Git facts, and verification evidence — nothing
about how a particular agent product is invoked, configured, or branded.

Everything provider-specific — how a skill is packaged for Claude Code
versus Codex, how instructions are surfaced to a given tool, provider
metadata files — belongs in `adapters/`. This is what allows BuildRail to
add support for a new coding agent without rewriting governance logic.

## Why this split matters

- **Core** can be tested and trusted independently of which agent is using
  it.
- **Skills** describe canonical workflow behavior once, rather than once
  per provider.
- **Adapters** stay thin: translation and packaging, not logic.
- **CLI** gives humans and agents alike one deterministic way to interact
  with Core, regardless of which higher-level workflow (skill or adapter)
  invoked it.

## Status

As of BR0, only the schema and documentation layer exists. No lifecycle
engine, policy engine, Git inspection, verification, CLI logic, or adapter
installation logic has been implemented. See `docs/ROADMAP.md`.
