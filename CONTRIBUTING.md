# Contributing to BuildRail

Thanks for your interest in contributing. A few things matter more here
than in a typical repository, because BuildRail is governance software and
holds itself to its own model.

## BuildRail governs BuildRail

This repository is developed under BuildRail's own governance discipline.
Before working on anything, check `.buildrail/state.yml` and
`.buildrail/config.yml` to see the current lifecycle state, development
phase, and active authorization. Contributions should fit within what is
currently authorized — see `docs/ROADMAP.md` and `docs/development/` for
phase scope. If you want to work on something outside the current phase,
open an issue or discussion first rather than sending a PR that assumes a
future phase is already authorized.

## Before major changes

For anything architectural — changes to the state machine, the
authorization model, protected-systems design, the schemas, or the
provider-neutrality boundary between core and adapters — open an issue or
discussion before writing code. These are foundational decisions and are
easier to get right with input before implementation than to unwind after.

## Review philosophy

BuildRail's own review model (see `docs/REVIEW_MODEL.md`) requires that:

- review targets an exact candidate SHA, not a description of changes
- the person or agent who implemented a change does not approve it
- review considers spec conformance, safety (protected systems), quality,
  and scope as separate axes

Expect PRs against this repository to be reviewed the same way.

## Tests and quality gates

BuildRail does not yet have executable product code, so automated tests and
quality gates are not yet mandatory. This will change as implementation
phases (BR1 onward) introduce real functionality — at that point, tests,
typechecking, and lint become required gates rather than optional ones. Do
not add tests that assert behavior which does not exist yet, and do not
claim test coverage that hasn't actually been run.

## Provider neutrality

BuildRail Core must remain neutral with respect to any specific coding
agent or provider. Claude Code and Codex are supported through adapters,
not through special-casing in core governance logic. Contributions must not
make BuildRail Core assume a Claude-only or Codex-only environment — new
provider-specific behavior belongs in `adapters/`, not in `packages/core`.

## Scope discipline

Don't silently expand the scope of a PR beyond what its issue or spec
describes. If while working you find something else that should change,
call it out separately rather than folding it in.
