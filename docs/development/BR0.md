# BR0 — Constitution

**Status: COMPLETE + INDEPENDENTLY APPROVED + FROZEN**
**Approved baseline SHA:** 04c93767510c51916fcc51f60b85b674c7d6f1cc

## Goal

Establish the BuildRail repository foundation and formal project
constitution before product implementation begins.

## Scope

- Repository structure
- Governance documents
- Architecture documents
- Roadmap
- State/config design
- Schema drafts
- Skill placeholders
- Adapter placeholders
- Template placeholders
- Workspace package structure

## Out of Scope

- Functional CLI implementation
- Git verification implementation
- Lifecycle engine implementation
- Runtime adapter installation
- CI
- GitHub Actions
- Git hooks
- npm publishing
- Production deployment

## Expected Deliverables

- Full repository tree as specified in
  `.buildrail/specs/BR0-CONSTITUTION.md`
- `docs/` specification and governance documents
- Draft JSON Schemas in `packages/core/schemas/`
- Placeholder source files in `packages/core` and `packages/cli` containing
  no functional implementation
- Draft `SKILL.md` files in `packages/skills/`
- Adapter placeholder READMEs/templates in `adapters/`
- Generic templates in `templates/`
- Example READMEs in `examples/`

## Entry Conditions

- Repository exists (empty or with no conflicting prior work)
- Human owner has authorized BR0

## Exit Conditions

- All acceptance criteria in `.buildrail/specs/BR0-CONSTITUTION.md` are met
- Independent review has evaluated the BR0 scaffold
- Human owner explicitly approves BR0 (this document does not self-approve
  BR0's completion)

All exit conditions above have been met. BR0 is frozen at the approved
baseline SHA recorded above and in `.buildrail/state.yml`
(`baselines.BR0`). Current implementation authorization: **none**. BR1–BR8
remain planned, not implementation-authorized.

## Dependencies

None — BR0 is the foundation phase.
