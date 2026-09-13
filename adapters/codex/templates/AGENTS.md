# AGENTS.md (BuildRail template for Codex — draft)

**Status: design draft (BR0). Not yet installed or enforced by any
BuildRail tooling.**

This is a template for the `AGENTS.md` that a BuildRail-governed project
using Codex would use. It is intentionally thin: BuildRail's canonical
state and policy live in `.buildrail/`, not here.

---

This project is governed by BuildRail.

Before making changes:

1. Read `.buildrail/state.yml` for current lifecycle state, development
   phase, and active authorization.
2. Read `.buildrail/config.yml` for project policy (protected systems,
   quality gates, review requirements).
3. Work only within the currently active authorization.

Rules:

- Repository facts outrank this file, stale reports, or conversation
  memory.
- You may report work as implemented, but you may not approve, freeze, or
  merge-authorize your own work.
- Never claim tests or verification you did not actually run.
- If authorization is unclear, STOP and ask the project owner.

For the full governance model, see `<PROJECT_ROOT>/docs/GOVERNANCE.md` (or
wherever this project keeps its BuildRail documentation).
