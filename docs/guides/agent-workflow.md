# Agent Workflow (target v0.1 experience)

**Status: none of this is implemented yet.** This describes the intended
workflow for a coding agent (e.g. Claude Code or Codex) operating under
BuildRail governance once BR1–BR8 are implemented.

## The intended loop

1. Read `.buildrail/state.yml` and `.buildrail/config.yml` before doing
   anything.
2. Confirm the work you're about to do falls within the active
   authorization's specification. If not, STOP (see `docs/GOVERNANCE.md`).
3. Run preflight to confirm the repository and branch are in a workable
   state.
4. Implement the authorized work only.
5. Run verification (quality gates) and produce evidence bound to the
   exact candidate SHA — never claim a result you didn't actually produce.
6. Report status as `IMPLEMENTED`, but do not approve, freeze, or
   merge-authorize your own work.
7. Produce a structured handoff if your session ends before the full
   lifecycle completes.

## What you must never do, per `AGENTS.md` and `docs/GOVERNANCE.md`

- Self-approve
- Self-freeze
- Authorize your own merge
- Claim unverified testing
- Modify frozen or locked systems without authorization
- Silently broaden scope

## Status

This workflow describes the v0.1 target for BR5 (Agent Skills) and BR6/BR7
(adapters). During BR0, the applicable rules are the short ones in
`AGENTS.md` and `docs/GOVERNANCE.md` — there is no skill or CLI tooling
enforcing this loop yet.
