# BR0 — BuildRail Constitution

**Status:** complete — independently approved — frozen
**Type:** foundation
**Granted by:** human
**Approved baseline SHA:** 04c93767510c51916fcc51f60b85b674c7d6f1cc

## Goal

Establish the BuildRail repository foundation and formal project
constitution before product implementation begins.

## In scope

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

## Out of scope

- Functional CLI implementation
- Git verification implementation
- Lifecycle engine implementation
- Runtime adapter installation
- CI
- GitHub Actions
- Git hooks
- npm publishing
- Production deployment

## Acceptance criteria

- All required directories exist
- All required documents exist
- `.buildrail/state.yml` and `.buildrail/config.yml` accurately reflect BR0
  status (not any later phase)
- Phase docs `docs/development/BR0.md` through `BR8.md` exist
- Schema drafts exist for config, state, authorization, verification report,
  and handoff
- No fake or invented implementation claims appear anywhere in the
  repository
- No phase later than BR0 is marked complete anywhere
- The repository is ready for independent BR0 review

## Notes

This specification governs only the creation of BuildRail's own foundation.
It does not authorize implementation of any BR1–BR8 capability. Completion
of BR0 requires independent review before it can be marked approved or
frozen — an implementation agent cannot self-approve this phase.

BR0 has passed independent review and is frozen at the approved baseline
SHA above (see `.buildrail/state.yml` under `baselines.BR0`). No
implementation authorization is currently active. BR1–BR8 remain planned,
not implementation-authorized.
