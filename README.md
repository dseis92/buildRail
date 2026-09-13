# BuildRail

**Governance for AI-assisted software development.**

> Vibe code without vibe-managing your repository.

## Status

**Experimental — BR0 and BR1 complete and frozen.**

BuildRail's foundational phase (BR0) is complete and frozen at baseline
`04c93767510c51916fcc51f60b85b674c7d6f1cc`. BR1 (CLI Skeleton) is also
complete, independently reviewed, Human-QA-passed, and frozen at approved
candidate `36f7b0a569eeee0cd1c5d7472cf176763c818a2e`. BuildRail now has a
real, executable `buildrail` CLI shell — but no governance engine, Git
inspection, or agent adapter yet. This repository currently contains the
project's specification, governance model, architecture, schemas, the CLI
skeleton, and remaining scaffolding — not yet a fully working governance
product. BR2–BR8 remain planned and not implementation-authorized. See
[Development Phases](#development-phases) below for what that means
concretely.

## What is BuildRail?

BuildRail is an open-source governance system for AI-assisted software
development. It exists to help people — especially nontechnical or
semi-technical "vibe coders" — successfully build real applications with
coding agents (Claude Code, Codex, and similar tools) while keeping those
agents constrained by:

- explicit, machine-readable project state
- explicit authorization for what an agent is allowed to do right now
- protected and frozen systems that agents cannot silently touch
- deterministic Git verification (not agent self-report)
- quality gates tied to an exact commit
- candidate-SHA-bound evidence
- independent review, separate from the implementing agent
- human QA as a required checkpoint
- reliable, auditable handoffs between agents and humans

## The problem

Coding agents can generate software very quickly. What they are bad at,
without explicit structure, is remembering what was actually authorized,
what already exists and is working, what must not be touched, whether tests
actually ran and passed, and what the real state of the Git repository is at
this exact moment. Left ungoverned, an agent can silently expand scope,
modify systems it shouldn't, claim testing it didn't do, or hand off
unclear or false status to the next agent or the human owner.

BuildRail does not make agents smarter. It makes the surrounding process
accountable: canonical state instead of stale prose, authorization instead
of implicit trust, and repository facts instead of self-reported claims.

## Core promise

BuildRail provides a governance layer that sits between a human project
owner and the coding agents working on their behalf:

- **Canonical project state** — a single source of truth for what phase the
  project is in, independent of any one conversation's memory.
- **Explicit implementation authorization** — agents work only within what
  has been explicitly authorized, not on their own initiative.
- **Protected and frozen systems** — parts of the codebase can be marked
  guarded, frozen, or locked so agents cannot silently modify them.
- **Deterministic Git verification** — facts about branches, SHAs, working
  tree state, and diffs are read from Git, not asserted by an agent.
- **Quality gates** — tests, typechecks, lint, and build are tied to a
  specific candidate commit, not reused across changes.
- **Candidate-SHA-bound evidence** — verification results are only valid for
  the exact commit they were produced against.
- **Independent review** — the implementing agent cannot approve its own
  work.
- **Human QA** — a required human checkpoint before merge authorization.
- **Reliable agent handoffs** — structured handoff artifacts instead of
  ad hoc chat summaries.
- **Claude Code and Codex compatibility** — via provider-neutral core
  governance plus thin adapters.

## What BuildRail is NOT

BuildRail intentionally does not try to be:

- a replacement for Git
- a CI platform
- an issue tracker
- a deployment service
- an AI model
- a code generator

BuildRail coordinates the *governance* of an AI-assisted development
lifecycle. It relies on Git, your existing tooling, and your coding agents —
it does not replace any of them.

## The lifecycle

BuildRail's core workflow moves work through explicit states:

```
IDEA
  ↓
SPECIFIED
  ↓
AUTHORIZED
  ↓
PREFLIGHT
  ↓
IMPLEMENTING
  ↓
IMPLEMENTED
  ↓
VERIFYING
  ↓
PENDING_REVIEW
  ↓
REVIEW_APPROVED
  ↓
HUMAN_QA
  ↓
MERGE_AUTHORIZED
  ↓
MERGED
  ↓
PRODUCTION_VERIFIED
  ↓
FROZEN
```

Work can also enter `BLOCKED` or `CORRECTION_REQUIRED` when something needs
human attention. See [`docs/STATE_MACHINE.md`](docs/STATE_MACHINE.md) for
full details.

**Core rule:** Prompts govern behavior. Code verifies facts. The human owner
is the final authority. See [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md).

## Development phases

BuildRail itself is being built in phases, using the same governance
discipline it asks of projects that adopt it.

| Phase | Name | Scope |
|-------|------|-------|
| **BR0** | Constitution | Repository foundation, specification, governance, architecture, schemas, roadmap. No functional CLI. — **COMPLETE + FROZEN** |
| **BR1** | CLI Skeleton | `buildrail --help`, `buildrail init`, `buildrail status` — **COMPLETE + FROZEN** |
| BR2 | Governance Engine | Config loading, state loading, validation, lifecycle transitions |
| BR3 | Git Inspection | Branch/SHA detection, working tree, diffs, protected-path and deletion/rename detection |
| BR4 | Verification | Quality gate commands, candidate-bound verification, `buildrail verify`, evidence reports |
| BR5 | Agent Skills | Planning, preflight, implementation, verification, review, completion, handoff skills |
| BR6 | Claude Code Adapter | Claude Code integration |
| BR7 | Codex Adapter | Codex integration |
| BR8 | End-to-End Dogfood | Govern BuildRail's own development using BuildRail; reference demo app; full lifecycle test |

**BR0 and BR1 are complete, independently approved, and frozen.** BR1
additionally passed Human QA before merge — see
[`.buildrail/specs/BR1-CLI-SKELETON.md`](.buildrail/specs/BR1-CLI-SKELETON.md).
No implementation phase is currently authorized; BR2–BR8 remain planned.
See [`docs/ROADMAP.md`](docs/ROADMAP.md) and
[`docs/development/`](docs/development/) for phase-by-phase detail.

## Documentation

- [`docs/BUILDRAIL_V0.1_SPEC.md`](docs/BUILDRAIL_V0.1_SPEC.md) — primary product specification
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system layers
- [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) — source-of-truth hierarchy, roles, STOP conditions
- [`docs/STATE_MACHINE.md`](docs/STATE_MACHINE.md) — lifecycle states and transitions
- [`docs/PROTECTED_SYSTEMS.md`](docs/PROTECTED_SYSTEMS.md) — protection levels
- [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md) — verification and evidence model
- [`docs/REVIEW_MODEL.md`](docs/REVIEW_MODEL.md) — independent review axes
- [`docs/ADAPTER_MODEL.md`](docs/ADAPTER_MODEL.md) — provider-neutral core, adapter responsibilities
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phase roadmap
- [`docs/concepts/`](docs/concepts/) — authorization, candidate SHA, protected systems, evidence, handoffs
- [`docs/guides/`](docs/guides/) — getting started, vibe-coder workflow, agent workflow

## Repository layout

```
.buildrail/       Canonical governance state, config, specs, decisions, reports
docs/             Specification and governance documentation
packages/core/    Provider-neutral governance engine (schemas only in BR0)
packages/cli/     buildrail CLI (skeleton implemented in BR1)
packages/skills/  Agent skill definitions (design drafts in BR0)
adapters/         Claude Code, Codex, and generic agent-skill adapters
templates/        Generic templates for BuildRail-managed projects
examples/         Planned reference examples (READMEs only in BR0)
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). BuildRail governs its own
development — contributions are expected to work within the currently
authorized phase.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
# buildRail
