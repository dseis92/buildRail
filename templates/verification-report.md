# Verification Report

**Candidate SHA:** <CANDIDATE_SHA>
**Branch:** <BRANCH>
**Timestamp:** <ISO_8601_TIMESTAMP>

> This report is only valid for the exact candidate SHA above. If the code
> changes after this report is produced, it becomes stale and must be
> re-run. See `docs/QUALITY_GATES.md`.

## Quality gates

| Gate | Category | Command | Status |
|------|----------|---------|--------|
| tests | AUTOMATED_TEST / NOT_CHECKED | `<command>` | pass / fail / error / not_checked |
| typecheck | TYPECHECK / NOT_CHECKED | `<command>` | pass / fail / error / not_checked |
| lint | LINT / NOT_CHECKED | `<command>` | pass / fail / error / not_checked |
| build | BUILD / NOT_CHECKED | `<command>` | pass / fail / error / not_checked |

## Protected path changes

_List any paths touched that match a declared protected system. If none,
say "None."_

## Unexpected deletions

_List any files deleted that were not expected given the specification. If
none, say "None."_

## Unexpected renames

_List any files renamed that were not expected given the specification. If
none, say "None."_

## Result

**Overall result:** pass / fail / blocked / stale
