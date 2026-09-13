# Roadmap

BuildRail is developed in explicit, sequential phases. Each phase has its
own authorization; a later phase does not begin until it is explicitly
authorized, regardless of how "obviously next" it may seem.

| Phase | Name | Summary | Status |
|-------|------|---------|--------|
| BR0 | Constitution | Repository foundation, specification, governance, architecture, schemas, roadmap. No functional CLI. | **COMPLETE + INDEPENDENTLY APPROVED + FROZEN** (baseline `04c93767510c51916fcc51f60b85b674c7d6f1cc`) |
| BR1 | CLI Skeleton | `buildrail --help`, `buildrail init`, `buildrail status` | **COMPLETE + INDEPENDENTLY APPROVED + HUMAN QA PASSED + FROZEN** (approved candidate `36f7b0a569eeee0cd1c5d7472cf176763c818a2e`, merged as `3b695399eae01720804ec496e7735d636edaed41`) |
| BR2 | Governance Engine | Config loading, state loading, validation, lifecycle transitions | **SPECIFIED** (not implementation-authorized) |
| BR3 | Git Inspection | Branch detection, HEAD/remote SHA, working tree, diff inspection, protected-path/deletion/rename detection | PLANNED |
| BR4 | Verification | Quality gate commands, candidate-bound verification, `buildrail verify`, evidence reports | PLANNED |
| BR5 | Agent Skills | Planning, preflight, implementation, verification, review, completion, handoff skills | PLANNED |
| BR6 | Claude Code Adapter | Claude Code integration | PLANNED |
| BR7 | Codex Adapter | Codex integration | PLANNED |
| BR8 | End-to-End Dogfood | Govern BuildRail's own development using BuildRail; reference demo app; full lifecycle test | PLANNED |

"PLANNED" means designed at a high level in this repository's documentation
but **not implementation-authorized**. No work should begin on a PLANNED
phase until its own authorization record is created and granted by the
human owner, mirroring the exact governance model BuildRail itself
enforces.

See `docs/development/BR0.md` through `BR8.md` for phase-level goal, scope,
out-of-scope boundary, expected deliverables, entry/exit conditions, and
dependencies.

## Sequencing rationale

The phases are ordered so that each depends only on facts and structures
already established by earlier phases:

- BR1 (CLI Skeleton) needs BR0's package/workspace structure to exist.
- BR2 (Governance Engine) needs BR1's CLI shell to expose commands through.
- BR3 (Git Inspection) needs BR2's config/state loading to know what to
  check facts against.
- BR4 (Verification) needs BR3's Git inspection to bind evidence to a real
  candidate SHA.
- BR5 (Agent Skills) needs BR2–BR4 so skills can describe real, checkable
  behavior instead of aspirational workflow.
- BR6/BR7 (Adapters) need BR5's canonical skills to adapt.
- BR8 (Dogfood) needs the full stack (BR1–BR7) to actually govern
  BuildRail's own development end to end.

## Current status

As of this writing, BR0 and BR1 are complete, independently reviewed,
approved, and frozen at the baseline SHAs recorded in
`.buildrail/state.yml` (`baselines.BR0`, `baselines.BR1`). BR1 additionally
passed Human QA before merge. No implementation phase is currently
authorized. BR2–BR8 remain planned and not implementation-authorized.
