# Templates

Generic templates for projects that adopt BuildRail governance. These are
**not** BuildRail's own governance files — they are starting points a new
BuildRail-managed project would copy and fill in.

Placeholders used throughout:

- `<PROJECT_NAME>` — the adopting project's name
- `<AUTHORIZATION_ID>` — a specific authorization's identifier
- `<DEFAULT_BRANCH>` — the adopting project's default branch name

## Contents

- [`AGENTS.md`](AGENTS.md) — generic agent instructions
- [`config.yml`](config.yml) — generic `.buildrail/config.yml` starting point
- [`state.yml`](state.yml) — generic `.buildrail/state.yml` starting point
- [`feature-spec.md`](feature-spec.md) — specification template for new features
- [`bugfix-spec.md`](bugfix-spec.md) — specification template for bug fixes
- [`maintenance-spec.md`](maintenance-spec.md) — specification template for maintenance work
- [`verification-report.md`](verification-report.md) — human-readable verification report template
- [`handoff.md`](handoff.md) — human-readable handoff template

## Status

These are drafts established during BR0. They are not yet installed by any
`buildrail init` command (planned BR1) — that automation doesn't exist
yet.
