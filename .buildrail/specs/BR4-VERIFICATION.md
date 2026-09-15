# BR4 — Verification

**Phase:** BR4
**Title:** Verification
**Status:** SPECIFICATION CANDIDATE
**Base:** BR3 (frozen at `b12f9a59cf79e7025f929b8f712c0a37384b8c7f`)

---

## 1. Purpose

BR4 implements candidate-SHA-bound verification: executing quality gate commands and producing immutable evidence reports that truthfully record what was checked, against what exact code, with what result.

### What BR4 Does

1. **Executes quality gate commands** defined in `.buildrail/config.yml`
2. **Binds evidence to exact Git state** using BR3 inspection capabilities
3. **Generates machine-readable verification reports** matching the BR4-finalized schema
4. **Detects stale evidence** when candidate SHA changes after verification
5. **Exposes `buildrail verify`** CLI command for on-demand verification
6. **Writes reports** to `.buildrail/reports/` with deterministic naming
7. **Records protected-path evidence** using BR3 diff inspection and path matching

### What BR4 Explicitly Does Not Do

- **BR5 agent skills** - planning, preflight, implementation automation
- **BR6/BR7 adapters** - Claude Code or Codex integration
- **Independent review automation** - evidence informs review but doesn't replace it
- **Merge decisions** - verification provides facts; BR2 governance makes policy decisions
- **Human QA automation** - evidence is mechanical; Human QA remains a separate judgment
- **Network/provider integration** - BR4 operates entirely offline
- **Lifecycle state transitions** - verification produces evidence; governance transitions remain separate

---

## 2. Candidate Identity Contract

### 2.1 Candidate Determination

BR4 determines the candidate being verified through this exact procedure:

1. **Resolve repository** using BR3 `resolveRepository(projectRoot)`
2. **Inspect HEAD** using BR3 `inspectHead(projectRoot)`
3. **Load state** using BR2 `loadState(projectRoot)`
4. **Extract candidate facts:**
   - `headSha` from `HeadInfo.headSha` (must be non-null, 40-char lowercase hex)
   - `branch` from `HeadInfo.branch` (may be null for detached HEAD)
   - `detached` from `HeadInfo.detached`
   - `unborn` from `HeadInfo.unborn`
   - `state.candidate.branch` from state metadata
   - `state.candidate.base_sha` from state metadata
   - `state.candidate.candidate_sha` from state metadata

### 2.2 Candidate Validation Rules

**For branch-based verification** (when `state.candidate.branch` is non-null):

- `HeadInfo.detached` MUST be false
- `HeadInfo.unborn` MUST be false
- `HeadInfo.branch` MUST equal `state.candidate.branch` (exact string match)
- `HeadInfo.headSha` MUST be non-null
- If `state.candidate.candidate_sha` is non-null, `HeadInfo.headSha` MUST equal `state.candidate.candidate_sha` (40-char lowercase hex exact match)
- If `state.candidate.base_sha` is non-null, it MUST be a valid 40-char lowercase hex SHA-1

**For detached HEAD** (when `state.candidate.branch` is null):

- `HeadInfo.detached` MUST be true
- `HeadInfo.headSha` MUST be non-null
- If `state.candidate.candidate_sha` is non-null, `HeadInfo.headSha` MUST equal it

**Unborn branch** (when `HeadInfo.unborn` is true):

- Verification MUST NOT proceed
- Result: `BLOCKED` with error `CANDIDATE_UNAVAILABLE`
- Rationale: No commit exists to verify

**Candidate/branch mismatch:**

- When `state.candidate.branch` is "feature/foo" but `HeadInfo.branch` is "feature/bar"
- Result: `BLOCKED` with error `BRANCH_MISMATCH`

**Candidate SHA mismatch:**

- When `state.candidate.candidate_sha` is "abc123..." but `HeadInfo.headSha` is "def456..."
- Result: `BLOCKED` with error `CANDIDATE_SHA_MISMATCH`

### 2.3 SHA Binding Guarantee

The verification report's `candidate_sha` field MUST contain `HeadInfo.headSha` exactly as validated above. This ensures the report names the exact commit that was present when verification began.

---

## 3. Dirty Working Tree Contract

### 3.1 Problem Statement

A Git commit SHA uniquely identifies committed content. However, when the working tree contains uncommitted changes (staged, unstaged, or untracked), the filesystem content being tested differs from the content named by the candidate SHA. Reporting "tests passed for SHA X" when tests actually ran against "SHA X plus uncommitted changes" is a false claim.

### 3.2 BR4 Working Tree Policy

**Verification MUST reject dirty working trees for candidate-SHA-bound evidence.**

Before executing any quality gate, BR4 MUST:

1. **Inspect working tree** using BR3 `inspectWorkingTree(projectRoot)`
2. **Check `WorkingTreeStatus.clean`**
3. **If `clean` is false:** Verification MUST NOT proceed

**Dirty conditions that block verification:**

- Staged changes (`staged_add`, `staged_modify`, `staged_delete`, `staged_rename`, `staged_type_change`)
- Unstaged modifications (`unstaged_modify`, `unstaged_delete`, `unstaged_rename`, `unstaged_type_change`)
- Untracked files (`untracked`) that are not report artifacts themselves
- Conflicted paths (`conflicted`)
- Submodule dirtiness (when `submodule.commitChanged`, `submodule.hasModifiedContent`, or `submodule.hasUntrackedContent` is true)

**Exceptions:**

- **Ignored files:** Ignored files do not appear in BR3's working tree inspection and do not affect `clean` status
- **Report artifacts:** See §4.4 for race handling

**Result when blocked:**

- Overall result: `BLOCKED`
- Error code: `DIRTY_CANDIDATE`
- Error message: "Working tree contains uncommitted changes. Candidate-SHA-bound verification requires a clean working tree matching the exact candidate commit."
- No quality gates are executed
- A report MAY still be written documenting the blocked condition

### 3.3 Rationale

This strict policy ensures that:

1. Evidence reports truthfully represent what was verified
2. "Pass" results are reproducible from the candidate commit alone
3. No hidden workspace state affects verification outcomes
4. Reviewers can trust that checking out the candidate SHA yields identical verification results

**Alternative considered and rejected:** Allowing dirty-tree verification with a "dirty" flag. Rejected because it creates ambiguity about what "pass" means and enables false claims of SHA-bound evidence.

---

## 4. Start/End SHA Race Detection

### 4.1 Problem Statement

Verification may take several minutes to execute all quality gates. The repository HEAD can change during this time (e.g., user commits while `npm test` is running). If HEAD changes during verification, the final evidence no longer corresponds to a single consistent candidate.

### 4.2 BR4 Race Detection Contract

**BR4 MUST snapshot candidate state before executing gates and verify it after gates complete:**

1. **Before first gate:** Capture starting candidate (`start_sha`, `start_branch`, `start_detached`)
2. **After final gate:** Re-inspect HEAD to obtain (`end_sha`, `end_branch`, `end_detached`)
3. **Compare:**
   - If `start_sha` ≠ `end_sha`: Race detected
   - If `start_branch` ≠ `end_branch`: Race detected

**When race is detected:**

- All executed gate results remain recorded in report with accurate timestamps/output
- Overall result: `STALE`
- Error code: `CANDIDATE_CHANGED_DURING_VERIFICATION`
- Error message: "Candidate SHA changed from {start_sha} to {end_sha} during verification. Evidence is stale."
- The report's `candidate_sha` field contains `start_sha` (the SHA gates were executed against)
- The report includes a `stale_reason` field documenting the race

**Between-gate checks:**

BR4 does NOT re-check HEAD between individual gates. This simplifies implementation and is sufficient because:

- The final check detects any change
- Partial gate results remain valuable diagnostic evidence even if stale
- Early-exit on detected change would discard diagnostic information

### 4.3 Stale Report Persistence

Reports that become `STALE` due to mid-verification races MUST still be written to disk. They provide valuable evidence that verification was attempted and what partial results were obtained before the change.

### 4.4 Report-Artifact Race Handling

**Special case:** If verification writes a report to `.buildrail/reports/` and that report is subsequently git-added/committed, the commit containing the report will have a different SHA than the candidate the report documents.

**BR4 Resolution:**

1. The `.buildrail/reports/` directory itself and its README are tracked
2. Generated report JSON files are NOT tracked in Git (see §14.2)
3. `.gitignore` includes `.buildrail/reports/*.json` to prevent accidental addition
4. If a user manually commits a report, that does not invalidate the report
5. Report staleness is computed by comparing the report's documented `candidate_sha` against current HEAD, not by checking if the report file itself is committed

---

## 5. Quality Gate Configuration

### 5.1 Configuration Source

Quality gates are defined in `.buildrail/config.yml` under the `quality_gates` key.

**Schema per gate:**

```yaml
quality_gates:
  <gate_name>:
    command: <string>
    required: <boolean>
    note: <optional string>
```

**Example:**

```yaml
quality_gates:
  tests:
    command: npm test
    required: true
    note: "Required for BR1 executable product code."
  lint:
    command: npm run lint
    required: false
    note: "Optional until lint configuration exists."
```

### 5.2 Gate Ordering

Gates MUST be executed in **deterministic lexicographic order by gate name**:

- "build" < "lint" < "tests" < "typecheck"

This ensures:

1. Reproducible execution order across runs
2. Predictable report structure
3. No dependency on YAML key ordering or hash map iteration

### 5.3 Required vs Optional Gates

**Required gate (`required: true`):**

- MUST be executed during verification
- If execution fails (process exit code ≠ 0), overall result is `FAIL`
- If execution errors (cannot launch, timeout, etc.), overall result is `BLOCKED`

**Optional gate (`required: false`):**

- MUST still be executed during standard `buildrail verify` invocation
- If execution fails, overall result may still be `PASS` if all required gates passed
- If execution errors, overall result is NOT automatically `BLOCKED` unless required gates also error

**CLI gate selection:** BR4 CLI does NOT support gate selection flags (e.g., `--only=tests`). All configured gates are always executed. Future phases may add selective execution if needed.

### 5.4 Invalid Configuration Handling

**Empty command:**

- If `command` is empty string or whitespace-only
- Gate result status: `NOT_CHECKED`
- Error: "Command is empty"
- Overall result: If required, `BLOCKED` with `INVALID_GATE_CONFIGURATION`

**Missing command:**

- If `command` key is absent
- Same as empty command

**Unknown/duplicate gates:**

- BR4 processes gates as found in loaded config
- BR2 config schema validation is authoritative for structural correctness
- BR4 does not add additional duplicate detection beyond schema enforcement

---

## 6. Command Execution Contract

### 6.1 Process Execution API

**Node.js API:** `child_process.execFile()` (promise-wrapped)

**No shell involvement by default:**

- Commands are NOT passed through a shell unless explicitly required
- This prevents shell injection and provides predictable behavior
- Command strings like `"npm test"` are parsed into argv: `["npm", "test"]`

**Argv parsing:**

- Simple whitespace splitting on space character
- NO support for quoted arguments, escaping, or variable substitution
- Rationale: Configured commands are simple tool invocations like `npm test`, not complex shell scripts

**Example:**

- Config: `command: npm test`
- Executed as: `execFile("npm", ["test"], ...)`

**Shell fallback:**

- If a configured command cannot be executed directly and the command contains shell metacharacters (`|`, `>`, `&`, `;`, etc.), BR4 MAY optionally fall back to shell execution
- This is NOT required in BR4; if a command needs shell features, it should be wrapped in a script
- If shell fallback is implemented: Use `process.platform === "win32" ? "cmd.exe /c" : "/bin/sh -c"`

### 6.2 Execution Environment

**Working directory:** Repository root from `RepositoryInfo.root`

**Environment variables:**

- Inherit `process.env` from buildrail verify process
- NO sanitization or filtering
- NO injection of BR4-specific environment variables
- Rationale: Gates are repository-owned policy commands; they run in the project's natural environment

**Standard streams:**

- `stdin`: Closed (equivalent to `< /dev/null`)
- `stdout`: Captured (UTF-8 decoded, see §6.4)
- `stderr`: Captured separately (UTF-8 decoded, see §6.4)

**Interactive commands:**

- Gates requiring interactive input will fail/hang
- This is correct behavior - verification gates must be non-interactive

### 6.3 Process Lifecycle

**Launch failure:**

- If `execFile` throws `ENOENT` (command not found): Gate status `ERROR`, error message "Command not found: <command>"
- Other launch errors (permission denied, etc.): Gate status `ERROR`, error details from errno

**Exit code:**

- Exit code 0: Gate status `PASS`
- Exit code non-zero: Gate status `FAIL`
- Signal termination (SIGTERM, SIGKILL, etc.): Gate status `ERROR`, error "Process terminated by signal <signal>"

**Timeout:**

- Default timeout: 600 seconds (10 minutes) per gate
- NOT configurable in BR4 (may be added in future phases if needed)
- On timeout: Process is killed with SIGTERM, then SIGKILL after 5s grace period
- Gate status: `ERROR`, error "Command exceeded 600s timeout"

**Process tree cleanup:**

- Node.js `execFile` handles process cleanup on exit
- Orphaned subprocesses are not BR4's responsibility

### 6.4 Output Capture

**Encoding:** UTF-8

**Decoding failure:**

- If stdout or stderr contains invalid UTF-8, replace invalid sequences with U+FFFD REPLACEMENT CHARACTER
- Do NOT fail the entire gate due to encoding issues
- Rationale: Binary output or encoding mismatches should not block evidence generation

**Size limits:**

- Per-stream limit: 1 MB (1,048,576 bytes) of decoded UTF-8
- If exceeded: Truncate at 1 MB boundary and append marker: `\n[OUTPUT TRUNCATED: exceeded 1MB limit]\n`
- Both stdout and stderr are independently limited
- Combined limit: 2 MB total per gate (1 MB stdout + 1 MB stderr)

**Truncation representation:**

- Report includes truncated output as-is with marker
- No separate "truncated: true" field in BR4; marker is sufficient

**Output inclusion in report:**

- Stdout and stderr are combined into a single `output` field per gate
- Format: `STDOUT:\n<stdout_content>\n\nSTDERR:\n<stderr_content>`
- If either stream is empty, its section is omitted

### 6.5 Fail-Fast vs Run-All

**BR4 uses "run-all" strategy:**

- All configured gates are executed regardless of earlier failures
- Rationale: Maximum diagnostic information for reviewers
- If early-exit is desired, configure only critical required gates

**Execution continues after:**

- Required gate failure (still execute optional gates)
- Optional gate failure (still execute remaining gates)
- Gate errors (still execute remaining gates unless error indicates system failure like out of memory)

### 6.6 Security: Trust Boundary

**Configured commands are trusted:**

- Quality gate commands come from `.buildrail/config.yml`, which is repository-owned policy
- They are intentionally executable project commands (like `npm test`)
- BR4 does NOT attempt to sandbox or restrict these commands
- This is correct: verification is running the project's own quality checks

**Untrusted data MUST NOT be interpolated:**

- Candidate SHA, branch name, paths, or other Git-derived values MUST NOT be concatenated into command strings
- All Git data is recorded in reports, not executed
- No command string construction using external inputs

**Example of forbidden behavior:**

```typescript
// FORBIDDEN: Interpolating Git data into command
const command = `npm test -- --sha=${candidateSha}`;  // WRONG!
```

---

## 7. Portability

### 7.1 Runtime Requirements

- **Node.js:** >=22.0.0 (matches BuildRail's existing requirement)
- **Git:** >= 2.45.0 (inherited from BR3)
- **Platform:** POSIX (Linux, macOS) and Windows

### 7.2 No Required External Tools

**Verification MUST NOT require:**

- Bash (use Node.js for scripting)
- GNU-specific utilities (grep, sed, awk, etc.)
- C/C++ compilers (unless project under test requires them)
- DYLD_INSERT_LIBRARIES or LD_PRELOAD
- Docker or containers
- Network access
- Multiple Git installations

### 7.3 Test Fixture Portability

**For BR4's own test suite:**

- Prefer `process.execPath` (Node.js binary) with JavaScript fixture scripts for quality gate simulation
- Example: `process.execPath /path/to/fake-test.js` instead of `bash -c 'exit 1'`
- Reason: Works identically on Windows and POSIX

**Platform-specific tests:**

- If platform differences exist (e.g., command lookup, path separators), test both behaviors
- Use `process.platform === "win32"` to distinguish

---

## 8. Result Taxonomy

### 8.1 Overall Report Result

**Values:** `"pass"`, `"fail"`, `"blocked"`, `"stale"`

#### PASS

**Definition:** All conditions required for valid successful candidate verification are satisfied.

**Criteria:**

1. Candidate validation succeeded (§2)
2. Working tree is clean (§3)
3. No SHA race detected (§4)
4. All **required** quality gates have status `PASS`
5. No gates have status `ERROR` if they are required
6. Report write succeeded

**Optional gate failures:**

- If an optional gate has status `FAIL`, overall result may still be `PASS` provided all required gates passed
- The report faithfully records the optional gate failure; it simply doesn't fail the overall verification

#### FAIL

**Definition:** One or more quality gates completed normally and failed.

**Criteria:**

1. Candidate validation succeeded
2. Working tree is clean
3. No SHA race detected
4. At least one **required** quality gate has status `FAIL`
5. No blocking errors prevented gate execution

**Precedence over PASS:**

- If ANY required gate fails, overall result is `FAIL` regardless of optional gate status

#### BLOCKED

**Definition:** Verification could not validly proceed or complete due to preconditions, policy, or infrastructure conditions.

**Criteria (any of):**

1. Candidate unavailable (unborn branch)
2. Candidate/branch mismatch
3. Candidate SHA mismatch
4. Working tree is dirty
5. Invalid gate configuration (required gate has empty command)
6. Repository resolution failure
7. Config or state load failure
8. Gate launch failure for required gate
9. Gate timeout for required gate
10. Report write failure

**No gates executed vs partial execution:**

- If precondition fails before any gates run, no gate results are included
- If some gates executed before block detected, those results are included

#### STALE

**Definition:** Evidence no longer corresponds to the current candidate being evaluated.

**Criteria (any of):**

1. SHA race: Candidate SHA changed from start to end of verification
2. Post-verification staleness: Report's `candidate_sha` differs from current HEAD

**Precedence:**

- STALE takes precedence over FAIL or PASS when a race is detected
- Rationale: Stale evidence cannot reliably claim "pass" or "fail" for a candidate

### 8.2 Precedence Rules

**When multiple conditions occur:**

1. **BLOCKED** > all others (if verification cannot validly proceed, it's blocked regardless of race or failures)
2. **STALE** > FAIL, PASS (if SHA changed, failures and passes are both stale)
3. **FAIL** > PASS (any required gate failure fails verification)

**Example scenario: Gate fails, then SHA changes during final gate:**

1. Gate execution completes with FAIL status
2. Final SHA check detects race
3. Overall result: `STALE` (not FAIL)
4. Report documents both the failure and the race

### 8.3 Per-Gate Status Values

**Values:** `"pass"`, `"fail"`, `"error"`, `"not_checked"`

#### pass

**Definition:** Process launched successfully and exited with code 0.

**Criteria:**

- `execFile` succeeded
- Exit code exactly 0
- No signal termination

#### fail

**Definition:** Process launched successfully and exited with non-zero status.

**Criteria:**

- `execFile` succeeded
- Exit code ≠ 0
- No signal termination

#### error

**Definition:** BR4 could not validly obtain a normal pass/fail result.

**Criteria (any of):**

- Command launch failed (ENOENT, EACCES, etc.)
- Process terminated by signal
- Timeout exceeded
- Encoding failure (should be rare given replacement character handling)

**Structural encoding:**

- Exit code: Included in report as separate `exit_code` field
- Signal: Included as `signal` field
- Error message: Included as `error` field
- Do NOT encode these in free-text `output` field

#### not_checked

**Definition:** Gate was intentionally not executed.

**Criteria:**

- Gate configured but command is empty
- Gate skipped due to earlier blocking error
- Future: Gate explicitly skipped by CLI flag (not in BR4)

---

## 9. Evidence Report Schema Reconciliation

### 9.1 Schema Evolution

The existing `packages/core/schemas/verification-report.schema.json` is a BR0 draft. BR4 owns finalizing it into the implementation contract.

### 9.2 Required Schema Changes

**Add missing fields:**

1. **`schema_version`** (required, type `number`, const `1`)
   - Enables future schema evolution
   - Must be first field in reports for human readability

2. **`repository`** (required, type `object`)
   - Addresses the docs/schema inconsistency (docs require repository, schema doesn't)
   - See §10 for structure

3. **`base_sha`** (optional, type `string`)
   - Documents the base commit for diff inspection
   - `null` if no diff inspection performed or base unavailable

4. **`detached`** (required, type `boolean`)
   - Documents whether HEAD was detached
   - Necessary for reproducing verification context

5. **`start_timestamp`** (required, type `string`, format `date-time`)
   - Documents when verification began (before first gate)

6. **`end_timestamp`** (required, type `string`, format `date-time`)
   - Documents when verification completed (after final gate)
   - Different from `timestamp` which documents report generation time

7. **Per-gate `exit_code`** (optional, type `number`)
   - Actual process exit code when available
   - `null` or absent for `not_checked` or launch failures

8. **Per-gate `duration_ms`** (optional, type `number`)
   - Gate execution time in milliseconds
   - Useful for performance tracking

9. **Per-gate `required`** (required, type `boolean`)
   - Documents whether this gate was required per config
   - Necessary for consumers to evaluate overall result

10. **`stale_reason`** (optional, type `string`)
    - Present when result is `STALE`
    - Explains why evidence became stale
    - Example: "Candidate SHA changed from abc123... to def456... during verification"

**Remove/modify:**

- **`additionalProperties: true`** → change to `false`
  - Current permissive policy allows arbitrary extra fields
  - BR4 tightens this to exact schema compliance
  - Rationale: Structured data should have defined meaning

**Rename `timestamp` → `report_timestamp`** for clarity (three timestamps exist: start, end, report)

### 9.3 Final BR4 Schema (Normative)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://buildrail.dev/schemas/verification-report.schema.json",
  "title": "BuildRail Verification Report",
  "description": "Candidate-SHA-bound verification evidence report. Finalized in BR4.",
  "type": "object",
  "required": [
    "schema_version",
    "repository",
    "candidate_sha",
    "branch",
    "detached",
    "start_timestamp",
    "end_timestamp",
    "report_timestamp",
    "quality_gates",
    "result"
  ],
  "properties": {
    "schema_version": {
      "type": "number",
      "const": 1,
      "description": "Report schema version. Always 1 for BR4."
    },
    "repository": {
      "type": "object",
      "required": ["root"],
      "properties": {
        "root": {
          "type": "string",
          "minLength": 1,
          "description": "Canonical absolute path to repository root, from BR3 resolveRepository."
        }
      },
      "additionalProperties": false
    },
    "candidate_sha": {
      "type": "string",
      "pattern": "^[0-9a-f]{40}$",
      "description": "Exact 40-character SHA-1 commit hash verified."
    },
    "base_sha": {
      "type": ["string", "null"],
      "pattern": "^[0-9a-f]{40}$",
      "description": "Base commit SHA for diff inspection. Null if not applicable."
    },
    "branch": {
      "type": ["string", "null"],
      "description": "Branch name. Null for detached HEAD."
    },
    "detached": {
      "type": "boolean",
      "description": "True if HEAD was detached during verification."
    },
    "start_timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp when verification began."
    },
    "end_timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp when verification completed."
    },
    "report_timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp when report was generated."
    },
    "quality_gates": {
      "type": "array",
      "items": { "$ref": "#/$defs/qualityGateResult" }
    },
    "protected_path_changes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "system"],
        "properties": {
          "path": { "type": "string" },
          "system": { "type": "string" },
          "matched_via": {
            "type": "string",
            "enum": ["path", "oldPath"]
          }
        },
        "additionalProperties": false
      },
      "description": "Protected paths touched by this candidate."
    },
    "unexpected_deletions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Deleted paths when policy forbids deletions."
    },
    "unexpected_renames": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to"],
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" }
        },
        "additionalProperties": false
      },
      "description": "Renamed paths when policy forbids renames."
    },
    "result": {
      "type": "string",
      "enum": ["pass", "fail", "blocked", "stale"]
    },
    "stale_reason": {
      "type": "string",
      "description": "Explanation when result is stale."
    },
    "errors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "message"],
        "properties": {
          "code": { "type": "string" },
          "message": { "type": "string" },
          "details": {}
        },
        "additionalProperties": false
      },
      "description": "Structural error details for blocked/error conditions."
    }
  },
  "additionalProperties": false,
  "$defs": {
    "qualityGateResult": {
      "type": "object",
      "required": ["name", "category", "command", "status", "required"],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "description": "Gate name from config (e.g., 'tests')."
        },
        "category": {
          "type": "string",
          "enum": [
            "AUTOMATED_TEST",
            "TYPECHECK",
            "LINT",
            "BUILD",
            "MANUAL_INSPECTION",
            "HUMAN_QA",
            "NOT_CHECKED"
          ]
        },
        "command": {
          "type": "string",
          "description": "Exact command string from config."
        },
        "status": {
          "type": "string",
          "enum": ["pass", "fail", "error", "not_checked"]
        },
        "required": {
          "type": "boolean",
          "description": "True if gate was required per config."
        },
        "exit_code": {
          "type": ["number", "null"],
          "description": "Process exit code. Null if not applicable."
        },
        "signal": {
          "type": ["string", "null"],
          "description": "Signal name if terminated by signal."
        },
        "duration_ms": {
          "type": ["number", "null"],
          "description": "Execution duration in milliseconds."
        },
        "output": {
          "type": "string",
          "description": "Combined stdout/stderr, possibly truncated."
        },
        "error": {
          "type": "string",
          "description": "Error message for status=error."
        }
      },
      "additionalProperties": false
    }
  }
}
```

---

## 10. Repository Identity

### 10.1 Definition

The report's `repository` object uniquely identifies which repository was verified.

**BR4 uses:** `repository.root` — the canonical absolute path to the repository root.

**Source:** `RepositoryInfo.root` from BR3 `resolveRepository()`.

**Example:**

```json
{
  "repository": {
    "root": "/Users/alice/dev/buildrail"
  }
}
```

### 10.2 Rationale for Path-Based Identity

**Why not remote URL?**

- Remote URLs may not exist (local-only repos)
- Fetching remote URL requires Git config access (may fail)
- Remote URLs can contain credentials/secrets
- BR4 must work entirely offline

**Why not project name?**

- Project name is policy (from config.yml), not repository fact
- Name can change without affecting repository identity

**Why canonical path?**

- Available from BR3 without additional Git calls
- Deterministic on a single machine
- No network requirement
- No secret exposure risk

**Cross-machine portability:**

- Repository paths differ across machines
- This is acceptable: Reports are bound to a specific verification run on a specific machine
- Cross-machine comparison uses `candidate_sha`, not `repository.root`

### 10.3 Normalization

BR3 already provides the resolved canonical path via realpath resolution. BR4 uses it as-is. No additional normalization (case folding, symlink resolution beyond BR3) is performed.

---

## 11. Timestamp Contract

### 11.1 Timestamp Fields

**Three distinct timestamps:**

1. **`start_timestamp`:** When verification began (before first gate execution)
2. **`end_timestamp`:** When verification completed (after final gate execution)
3. **`report_timestamp`:** When the report JSON was serialized and written

**All timestamps MUST:**

- Be UTC (no local time)
- Use ISO 8601 / RFC 3339 format: `YYYY-MM-DDTHH:MM:SS.sssZ`
- Example: `"2026-09-15T14:32:01.847Z"`

**Per-gate `duration_ms`:**

- Milliseconds elapsed from gate launch to exit
- Calculated as `end_time - start_time` per gate
- Independent of overall verification duration

### 11.2 Clock Source

**Node.js API:** `new Date().toISOString()`

**Monotonicity:** Not guaranteed across timestamps. If system clock adjusts during verification, timestamps may not be strictly monotonic. This is acceptable—timestamps document when events occurred according to system clock.

**Testing:** Tests MUST use an injectable clock seam (function parameter or module mock) rather than real-time waits. This ensures deterministic tests and avoids brittle time-based assertions.

---

## 12. Protected Path Evidence

### 12.1 Purpose

Document which protected paths (if any) were modified by the candidate under verification. This evidence informs reviewers about policy-relevant changes.

### 12.2 Evidence Collection Procedure

**When `state.candidate.base_sha` is non-null:**

1. **Inspect diff** using BR3 `inspectDiff(projectRoot, { fromRef: base_sha, toRef: candidate_sha })`
2. **Obtain `DiffResult.changes`** array
3. **Convert to `ProtectedPathCheckInput[]`:**
   - For added/modified/deleted/type_changed: `{ path: change.path, origin: "current" }`
   - For renamed: Two entries:
     - `{ path: change.oldPath!, origin: "old_side_of_rename" }`
     - `{ path: change.path, origin: "current" }`
4. **Match against protected systems** using BR3 `matchProtectedPaths(inputs, config.protected_systems)`
5. **Record `ProtectedPathMatchResult.matches`** in report

**When `state.candidate.base_sha` is null:**

- No diff inspection performed
- `protected_path_changes` array is empty `[]`
- This is common during initial development when candidate metadata isn't yet populated

### 12.3 Report Structure

**Per matched path:**

```json
{
  "path": "src/auth/login.ts",
  "system": "auth",
  "matched_via": "path"
}
```

**Fields:**

- `path`: The file path that matched
- `system`: The `name` of the `ProtectedSystem` from config
- `matched_via`: `"path"` or `"oldPath"` (from BR3 `ProtectedPathMatch.matchedVia`)

**Ordering:** Deterministic sort by `(system, path, matched_via)`

**Deduplication:** BR3 already provides deduplicated matches; BR4 uses them as-is

### 12.4 Policy vs Evidence Separation

**CRITICAL:** BR4 records protected path matches as **evidence**. It does NOT make policy decisions about whether changes are allowed.

BR2 governance policy (via `config.protected_systems[].status` such as `locked`) determines what's permitted. BR4 simply reports facts:

- "These protected paths were touched"
- Not: "Verification is blocked because protected paths were touched"

Reviewers consume this evidence alongside policy to make authorization decisions.

---

## 13. Unexpected Deletions / Renames

### 13.1 Problem Statement

The draft report schema includes `unexpected_deletions` and `unexpected_renames`, but "unexpected" requires a definition of what's "expected."

Current config policy:

```yaml
change_control:
  additive_by_default: true
  unexpected_deletion: stop
  unexpected_rename: stop
```

This policy expresses a **preference** against deletions/renames, but does NOT provide a mechanism to declare specific deletions/renames as "expected" (e.g., an allowlist).

### 13.2 BR4 Interpretation

**With current BR4 config schema:**

- There is NO allowlist mechanism to declare expected deletions/renames
- Therefore, BR4 interprets `unexpected_deletion: stop` as: **any deletion is unexpected**
- And `unexpected_rename: stop` as: **any rename is unexpected**

**Evidence reporting:**

When `state.candidate.base_sha` is non-null:

1. Inspect diff (same as §12)
2. Extract deleted paths: `DiffChange` where `kind === "deleted"`
3. Extract renamed paths: `DiffChange` where `kind === "renamed"` → `{from: oldPath, to: path}`
4. Record in report arrays

**When policy is `unexpected_deletion: warn` or `allow`:**

- BR4 still records deletions in the report
- The report field name `unexpected_deletions` is misleading in `allow` mode but preserved for schema consistency
- Future config schema may add an allowlist mechanism; BR4 does not implement it

### 13.3 Overall Result Impact

**`unexpected_deletion: stop`**:

- If any deletions exist: Overall result is `BLOCKED`
- Error code: `UNEXPECTED_DELETION_FORBIDDEN`

**`unexpected_rename: stop`**:

- If any renames exist: Overall result is `BLOCKED`
- Error code: `UNEXPECTED_RENAME_FORBIDDEN`

**`unexpected_deletion: warn` or `allow`, `unexpected_rename: warn` or `allow`**:

- Deletions/renames are recorded in report
- Overall result is NOT automatically `BLOCKED`
- Reviewers evaluate evidence

### 13.4 Schema Clarification

**BR4 does NOT rename these fields.** They remain `unexpected_deletions` and `unexpected_renames` for schema continuity.

**Semantic clarification:** In BR4, "unexpected" means "not explicitly allowed by an allowlist," and since no allowlist exists, all deletions/renames are unexpected when policy is `stop`.

**Future evolution:** BR5 or later may introduce:

```yaml
change_control:
  expected_deletions:
    - deprecated/old-api.ts
  expected_renames:
    - { from: old-name.ts, to: new-name.ts }
```

BR4 does not implement this.

---

## 14. Report Storage Model

### 14.1 Reports Directory

**Location:** `.buildrail/reports/`

**Structure:**

```
.buildrail/
  reports/
    README.md          # Tracked, describes purpose
    *.json             # Gitignored, generated evidence
```

### 14.2 Gitignore Policy

**BR4 requires `.gitignore` to include:**

```
.buildrail/reports/*.json
```

**Rationale:**

1. **Avoid SHA race:** Committing a report for SHA `abc123` into the repo creates a new commit `def456`, making the report immediately stale by construction
2. **Evidence is external:** Reports are verification artifacts, not source code
3. **Immutability:** Reports should not be edited post-generation
4. **Historical value:** Reports can be archived externally (CI artifacts, review systems) if needed

**Tracked files:**

- `.buildrail/reports/README.md` — documents purpose, remains tracked

**Generated files:**

- `.buildrail/reports/verification-<timestamp>-<short-sha>.json` — gitignored

### 14.3 Filename Format

**Pattern:** `verification-<ISO8601-timestamp>-<short-sha>.json`

**Example:** `verification-2026-09-15T14-32-01-847Z-b12f9a5.json`

**Components:**

- `verification-` prefix (constant)
- ISO 8601 timestamp from `start_timestamp`, with `:` replaced by `-` for filesystem safety
- `-` separator
- Short SHA: first 7 characters of `candidate_sha`
- `.json` extension

**Collision resistance:**

- Timestamp precision to milliseconds
- Short SHA disambiguation
- Extremely low probability of collision
- If collision occurs (two runs in same millisecond for same SHA): Second write overwrites first (acceptable, both represent same candidate)

### 14.4 Atomic Write Strategy

**Procedure:**

1. Serialize report JSON to string
2. Write to temp file: `.buildrail/reports/.tmp-<random>.json`
3. `fsync` temp file
4. `fs.rename` temp file to final name
5. `fsync` parent directory (POSIX only; optional on Windows)

**Rationale:** `rename` is atomic on POSIX. Partial writes are prevented.

**Partial write recovery:**

- Temp files with `.tmp-` prefix are treated as garbage
- Cleanup: Not automatic in BR4; may be added in future if needed

### 14.5 Overwrite Policy

**If final report filename already exists:**

- Overwrite silently (via atomic rename)
- This is acceptable because the filename encodes timestamp+SHA; identical filenames imply identical evidence context

**Historical reports:**

- Prior runs for different candidates accumulate
- No automatic cleanup/retention policy in BR4
- Users may manually delete old reports if desired

### 14.6 Permissions

**POSIX:** Reports are written with `0644` (user rw, group/other read)

**Windows:** Default ACL from Node.js `fs.writeFile`

**No special handling** for restricted permissions; reports are not secrets.

### 14.7 Path Traversal Prevention

**Report filenames are deterministic and controlled** by BR4, not user input. No path traversal risk exists.

**Parent directory check:**

- Before write, verify `.buildrail/reports/` exists and is a directory
- If missing: Create with `fs.mkdir(recursive: true)`
- If exists but is a file or symlink: Error `REPORTS_DIRECTORY_INVALID`

**Symlink handling:**

- If `.buildrail/reports` is a symlink, BR4 follows it (standard filesystem behavior)
- No special symlink blocking; reports are not sensitive

---

## 15. Report Immutability and Re-Runs

### 15.1 Immutability Principle

**Every verification invocation creates a new immutable evidence artifact.**

Reports are **never modified** after write. If re-verification occurs (same SHA, later timestamp), a new report file is created with a distinct timestamp.

### 15.2 Re-Run Behavior

**Scenario:** User runs `buildrail verify` twice against the same candidate SHA.

**Result:**

- First run: `verification-2026-09-15T14-32-01-847Z-b12f9a5.json`
- Second run: `verification-2026-09-15T14-45-12-123Z-b12f9a5.json`

**Both reports coexist.** Consumers determine which is "latest" by comparing `start_timestamp`.

### 15.3 Latest Report Determination

**Algorithm for finding latest valid report for a given SHA:**

1. List all `verification-*.json` files in `.buildrail/reports/`
2. Parse each filename to extract short SHA
3. Filter to candidates matching target SHA prefix
4. Parse each JSON to validate schema and extract `candidate_sha`
5. Filter to exact SHA match
6. Sort by `start_timestamp` descending
7. Return first (most recent)

**Not implemented in BR4 CLI:** The `buildrail verify` command does not have a "show latest report" feature. This is future work (possibly BR5).

### 15.4 Failed vs Successful Attempts

**Historical reports show the full verification history:**

- Earlier `FAIL` result
- Later `PASS` result after fixes

Reviewers can audit this history to understand candidate evolution.

---

## 16. Stale-Evidence Detection

### 16.1 Staleness Definition

**Evidence is stale when:**

1. **Mid-verification race:** `candidate_sha` changed from `start_sha` to `end_sha` during verification (§4)
2. **Post-verification staleness:** Current HEAD differs from report's `candidate_sha`

### 16.2 Detection Mechanism

**During verification (§4):**

- BR4 automatically detects SHA races
- Overall result becomes `STALE`
- `stale_reason` field is populated

**After verification:**

- External tools or future BR4 features can compare:
  - `current_head_sha = inspectHead(projectRoot).headSha`
  - `report_candidate_sha = report.candidate_sha`
  - If `current_head_sha !== report_candidate_sha`: Report is stale

**Not implemented in BR4:**

- No `buildrail verify --check-stale` command
- No `buildrail status` integration showing stale verification
- These are future enhancements (possibly BR5)

### 16.3 Staleness is Computed, Not Mutated

**Historical reports do NOT mutate from `pass` to `stale`.**

The report JSON on disk remains immutable. Staleness is a **dynamic comparison** between the report's documented SHA and current repository state.

**Example:**

1. Verification produces `report.json` with `candidate_sha: abc123`, `result: pass`
2. New commit `def456` is made
3. The report file is unchanged: still says `abc123` and `pass`
4. External comparison detects: `abc123 ≠ def456` → stale
5. The report itself remains valid historical evidence for `abc123`

---

## 17. Core API Contract

### 17.1 Public API Additions

BR4 adds to `@buildrail/core` exports:

```typescript
export {
  runVerification,
  loadVerificationReport,
} from "./verification/index.js";

export type {
  VerificationRequest,
  VerificationResult,
  VerificationReport,
  QualityGateResult,
  VerificationError,
  VerificationErrorCode,
} from "./verification/index.js";
```

### 17.2 `runVerification`

**Signature:**

```typescript
export async function runVerification(
  projectRoot: string,
  options?: VerificationOptions
): Promise<VerificationResult>;
```

**Inputs:**

- `projectRoot: string` — Absolute path to repository root
- `options?: VerificationOptions` — Reserved for future extensions (not used in BR4)

**Outputs:**

```typescript
export type VerificationResult =
  | { ok: true; report: VerificationReport; reportPath: string }
  | { ok: false; error: VerificationError };
```

**Success case:**

- `report`: The complete verification report object
- `reportPath`: Absolute path to written report file

**Behavior:**

1. Resolve repository (BR3)
2. Load config and state (BR2)
3. Validate candidate (§2)
4. Check working tree (§3)
5. Snapshot start SHA (§4)
6. Execute quality gates (§5, §6)
7. Snapshot end SHA (§4)
8. Collect protected path evidence (§12)
9. Evaluate change control policy (§13)
10. Compute overall result (§8)
11. Serialize report to JSON (§9)
12. Write report to file (§14)
13. Validate written report against schema (§18)
14. Return result

**Errors:**

- Repository resolution failure → `VerificationError` with `code: "REPOSITORY_RESOLUTION_FAILED"`
- Config/state load failure → `code: "GOVERNANCE_LOAD_FAILED"`
- Other errors per §17.3

**Side effects:**

- Writes report JSON to `.buildrail/reports/`
- Executes quality gate commands (process execution)

**Determinism:**

- Same repository state + same config → same verification outcome (modulo timestamps)
- Quality gate commands themselves may be non-deterministic (e.g., flaky tests); BR4 faithfully records actual results

**Ordering:**

- Gates are executed in lexicographic order by name (§5.2)
- Report includes gates in same order

### 17.3 `loadVerificationReport`

**Signature:**

```typescript
export async function loadVerificationReport(
  reportPath: string
): Promise<LoadResult<VerificationReport>>;
```

**Inputs:**

- `reportPath: string` — Absolute path to report JSON file

**Outputs:**

```typescript
export type LoadResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BuildRailError };
```

**Behavior:**

1. Read file
2. Parse JSON
3. Validate against BR4 schema
4. Return parsed report

**Errors:**

- File not found → `code: "REPORT_NOT_FOUND"`
- Invalid JSON → `code: "REPORT_MALFORMED_JSON"`
- Schema validation failure → `code: "REPORT_SCHEMA_INVALID"`

**Usage:**

- For external tools analyzing historical reports
- Not used by `buildrail verify` itself

---

## 18. Error Taxonomy

### 18.1 Verification Error Codes

```typescript
export type VerificationErrorCode =
  | "REPOSITORY_RESOLUTION_FAILED"
  | "GOVERNANCE_LOAD_FAILED"
  | "CANDIDATE_UNAVAILABLE"
  | "BRANCH_MISMATCH"
  | "CANDIDATE_SHA_MISMATCH"
  | "DIRTY_CANDIDATE"
  | "INVALID_BASE_SHA"
  | "GIT_INSPECTION_FAILED"
  | "INVALID_GATE_CONFIGURATION"
  | "GATE_LAUNCH_FAILED"
  | "GATE_TIMEOUT"
  | "CANDIDATE_CHANGED_DURING_VERIFICATION"
  | "UNEXPECTED_DELETION_FORBIDDEN"
  | "UNEXPECTED_RENAME_FORBIDDEN"
  | "REPORT_SERIALIZATION_FAILED"
  | "REPORT_SCHEMA_INVALID"
  | "REPORTS_DIRECTORY_INVALID"
  | "REPORT_WRITE_FAILED";
```

### 18.2 Error Structure

```typescript
export interface VerificationError extends BuildRailError {
  code: VerificationErrorCode;
  message: string;
  details?: unknown;
}
```

**Inherits from BR2 `BuildRailError`** for consistency across @buildrail/core.

### 18.3 Error Handling Strategy

**Fail fast for preconditions:**

- Candidate unavailable → immediate error, no gates executed

**Fail slow for gates:**

- Gate launch failure for optional gate → record ERROR, continue to next gate
- Gate launch failure for required gate → record ERROR, result is BLOCKED, but other gates may still execute for diagnostic value

**Report write failure:**

- If report write fails after successful verification → `REPORT_WRITE_FAILED` error
- Verification results are still returned in `VerificationResult.report` (in-memory)
- Rationale: Evidence was produced, even if persistence failed

---

## 19. Verification Report Validation

### 19.1 Schema Validation

**BR4 uses JSON Schema validation** via the BR2 schema registry.

**Validation points:**

1. **Before write:** Validate in-memory report object against schema
2. **On load:** Validate loaded report against schema (via `loadVerificationReport`)

**Validation failure:**

- Before write: `REPORT_SCHEMA_INVALID` error, report is NOT written
- On load: Return error to caller

**Schema registry:**

```typescript
import { createRegistry } from "@buildrail/core";

const registry = await createRegistry();
const result = registry.validate(
  "https://buildrail.dev/schemas/verification-report.schema.json",
  report
);
```

### 19.2 Unknown Schema Versions

**Reports with `schema_version !== 1`:**

- BR4 rejects them with `REPORT_SCHEMA_INVALID`
- Future phases may support multiple versions

### 19.3 AdditionalProperties Policy

**BR4 schema sets `additionalProperties: false`** on all objects.

**Reports with extra fields:**

- Validation fails
- Report is rejected

**Rationale:** Structured evidence should have defined meaning. Arbitrary fields undermine schema-based consumers.

---

## 20. Overall Pass Algorithm

### 20.1 Normative Pseudocode

```
function runVerification(projectRoot):
  // Preconditions
  repo = resolveRepository(projectRoot)
  if repo is error:
    return BLOCKED(REPOSITORY_RESOLUTION_FAILED)

  config = loadConfig(projectRoot)
  state = loadState(projectRoot)
  if config or state is error:
    return BLOCKED(GOVERNANCE_LOAD_FAILED)

  // Candidate validation
  head = inspectHead(projectRoot)
  if head is error:
    return BLOCKED(GIT_INSPECTION_FAILED)

  candidate = validateCandidate(head, state.candidate)
  if candidate is error:
    return BLOCKED(candidate.code)  // BRANCH_MISMATCH, etc.

  // Working tree check
  workingTree = inspectWorkingTree(projectRoot)
  if not workingTree.clean:
    return BLOCKED(DIRTY_CANDIDATE)

  // Start snapshot
  start_sha = head.headSha
  start_branch = head.branch
  start_timestamp = now()

  // Quality gates
  gates = loadGatesFromConfig(config)
  gate_results = []
  for gate in sorted(gates, by: gate.name):
    result = executeGate(gate, repo.root)
    gate_results.append(result)

  // End snapshot
  end_head = inspectHead(projectRoot)
  end_sha = end_head.headSha
  end_timestamp = now()

  // Race detection
  if start_sha != end_sha:
    return STALE(
      CANDIDATE_CHANGED_DURING_VERIFICATION,
      candidate_sha: start_sha,
      gate_results: gate_results
    )

  // Protected path evidence
  protected_changes = []
  if state.candidate.base_sha is not null:
    diff = inspectDiff(projectRoot, {
      fromRef: state.candidate.base_sha,
      toRef: candidate_sha
    })
    inputs = diffChangesToProtectedInputs(diff.changes)
    matches = matchProtectedPaths(inputs, config.protected_systems)
    protected_changes = matches

  // Change control policy
  deletions = filter(diff.changes, kind == "deleted")
  renames = filter(diff.changes, kind == "renamed")

  if config.change_control.unexpected_deletion == "stop" and deletions.length > 0:
    return BLOCKED(UNEXPECTED_DELETION_FORBIDDEN)

  if config.change_control.unexpected_rename == "stop" and renames.length > 0:
    return BLOCKED(UNEXPECTED_RENAME_FORBIDDEN)

  // Overall result computation
  overall_result = computeOverallResult(gate_results, config.quality_gates)

  // Report generation
  report = {
    schema_version: 1,
    repository: { root: repo.root },
    candidate_sha: start_sha,
    base_sha: state.candidate.base_sha,
    branch: head.branch,
    detached: head.detached,
    start_timestamp: start_timestamp,
    end_timestamp: end_timestamp,
    report_timestamp: now(),
    quality_gates: gate_results,
    protected_path_changes: protected_changes,
    unexpected_deletions: deletions,
    unexpected_renames: renames,
    result: overall_result,
    errors: collectErrors()
  }

  // Schema validation
  validation = validateAgainstSchema(report)
  if not validation.ok:
    return error(REPORT_SCHEMA_INVALID)

  // Write report
  reportPath = writeReportToFile(report)
  if reportPath is error:
    return error(REPORT_WRITE_FAILED)

  return success(report, reportPath)


function computeOverallResult(gate_results, gate_configs):
  required_gates = filter(gate_configs, required == true)

  for gate_result in gate_results:
    if gate_result.required and gate_result.status == "error":
      return "blocked"

  for gate_result in gate_results:
    if gate_result.required and gate_result.status == "fail":
      return "fail"

  return "pass"
```

### 20.2 Implementation Notes

Actual implementation may differ in structure (e.g., async/await, error handling), but MUST preserve these semantics:

1. Precondition checks before gates
2. Working tree validation before gates
3. SHA snapshot before/after gates
4. All gates executed (fail-slow)
5. Overall result computed from required gate statuses
6. Schema validation before write

---

## 21. CLI Contract — buildrail verify

### 21.1 Command Signature

**Primary command:**

```
buildrail verify
```

**Help command:**

```
buildrail verify --help
```

**No other options in BR4.** Future phases may add:

- `--gates=tests,typecheck` (gate selection)
- `--report-only` (skip execution, show latest report)

### 21.2 Behavior

**When invoked:**

1. Determine `projectRoot`:
   - Start from `process.cwd()`
   - Walk upward looking for `.buildrail/` directory (inherited from BR1/BR2 CLI convention)
2. Call `runVerification(projectRoot)`
3. Process result (see §21.3)

**Output to stdout:**

**On success:**

```
BuildRail Verification

Candidate: <short-sha> on <branch>
Repository: <root>

Quality Gates:
  ✓ tests (required) — PASS
  ✓ typecheck (required) — PASS
  ⚠ lint (optional) — FAIL
  ✓ build (required) — PASS

Result: PASS

Report: .buildrail/reports/verification-2026-09-15T14-32-01-847Z-b12f9a5.json
```

**On failure:**

```
BuildRail Verification

Candidate: <short-sha> on <branch>
Repository: <root>

Quality Gates:
  ✗ tests (required) — FAIL (exit code 1)
  ✓ typecheck (required) — PASS
  ⚠ lint (optional) — FAIL
  ✓ build (required) — PASS

Result: FAIL

Report: .buildrail/reports/verification-2026-09-15T14-32-01-847Z-b12f9a5.json
```

**On blocked:**

```
BuildRail Verification

Error: Working tree contains uncommitted changes.
Candidate-SHA-bound verification requires a clean working tree.

Result: BLOCKED

No report generated.
```

**On stale:**

```
BuildRail Verification

Candidate: <short-sha> on <branch> (SHA changed during verification)

Quality Gates:
  ✓ tests (required) — PASS
  ✗ typecheck (required) — FAIL

Result: STALE

Reason: Candidate SHA changed from abc123... to def456... during verification.

Report: .buildrail/reports/verification-2026-09-15T14-32-01-847Z-abc123.json
```

**Symbols:**

- `✓` for pass
- `✗` for fail/error
- `⚠` for optional gate failure

### 21.3 Exit Codes

```typescript
export const EXIT_CODE = {
  SUCCESS: 0,           // Overall result: PASS
  VERIFICATION_FAILED: 1,  // Overall result: FAIL
  BLOCKED: 2,           // Overall result: BLOCKED
  STALE: 3,             // Overall result: STALE
  INVALID_USAGE: 64,    // Unknown argument, --help, etc.
} as const;
```

**Mapping:**

- `result === "pass"` → exit 0
- `result === "fail"` → exit 1
- `result === "blocked"` → exit 2
- `result === "stale"` → exit 3
- Invalid CLI arguments → exit 64

### 21.4 Stderr

**Errors and warnings go to stderr:**

```
Error: Repository resolution failed.
```

**Verbose output:**

- Not implemented in BR4
- Future: `--verbose` flag may show gate stdout/stderr inline

---

## 22. No False Success

### 22.1 Hard Requirement

**`buildrail verify` MUST NOT exit successfully (code 0) when:**

1. A required quality gate failed
2. A required quality gate was not checked
3. Candidate evidence is stale (race detected)
4. Verification was blocked (precondition failure)
5. Report could not be written or validated
6. Commands ran against a different candidate than the report names

**Enforcement:**

- Exit code 0 ONLY when overall result is `PASS`
- `PASS` ONLY when all required gates have status `pass` and no blocking errors occurred

### 22.2 Optional Gate Semantics

**When an optional gate fails:**

- Gate result: `status: "fail"`
- Overall result: May still be `PASS` if all required gates passed
- Exit code: 0 (success)
- Rationale: Optional gates provide diagnostic info but do not fail verification

**Example:**

- Required: tests (PASS), typecheck (PASS), build (PASS)
- Optional: lint (FAIL)
- Overall: PASS
- Exit: 0

**This is correct behavior.** Lint failure is recorded and visible in report; reviewers can evaluate it, but it doesn't block verification.

---

## 23. Report Output and Secret Safety

### 23.1 Output Capture Scope

**BR4 captures:**

- Quality gate stdout (up to 1 MB per gate, §6.4)
- Quality gate stderr (up to 1 MB per gate, §6.4)

**BR4 does NOT capture:**

- Environment variables
- System information beyond repository root
- Network requests
- File contents
- Arbitrary "context" dumps

### 23.2 Secret Exposure Risk

**Quality gate commands may output secrets:**

- Credentials in test failure messages
- API tokens in build logs
- URLs with embedded auth
- User-specific paths

**BR4 does NOT attempt secret redaction.**

**Rationale:**

1. Reliable secret detection is extremely difficult
2. False positives/negatives undermine trust
3. Quality gates are repository-owned commands; output control is the project's responsibility
4. Reports are local artifacts, not automatically published

**Documented warning:**

BR4 documentation MUST warn users:

> **Secret Safety:** Verification reports include quality gate command output, which may contain secrets, credentials, or sensitive paths. Do not publish reports containing sensitive information. Configure quality gates to avoid outputting secrets (e.g., use `--silent` flags, sanitize test output).

### 23.3 User Responsibility

**Projects SHOULD:**

- Configure test commands to minimize verbose output
- Use CI-specific environment detection to suppress secrets in output
- Review reports before sharing externally

**BR4 provides:** Faithful evidence of what commands output, not sanitized/redacted evidence.

---

## 24. Size Limits

### 24.1 Per-Stream Limits

**Stdout per gate:** 1 MB (1,048,576 bytes UTF-8 decoded)

**Stderr per gate:** 1 MB (1,048,576 bytes UTF-8 decoded)

**Combined per gate:** 2 MB (1 MB stdout + 1 MB stderr)

**Total report size:** Unbounded in BR4 (all gates may reach 2 MB each, producing multi-MB reports)

### 24.2 Truncation

**Truncation marker:**

```
[OUTPUT TRUNCATED: exceeded 1MB limit]
```

**Appended to end of truncated stream.**

**JSON representation:**

- Truncated output stored as-is in `output` field
- No separate `truncated: true` boolean

### 24.3 No Total Report Limit

**BR4 does not impose a maximum total report size.**

Rationale: If a project has 20 gates each producing 1 MB output, the resulting 40 MB report is truthful evidence. Capping it would lose information.

**Practical limits:**

- Filesystem limits (ext4 max file size: 16 TB)
- JSON parser limits (Node.js can handle multi-GB JSON)

---

## 25. Concurrency

### 25.1 Multiple `buildrail verify` Processes

**BR4 does NOT implement global locks** to prevent concurrent verification.

**Collision handling:**

- Each process generates a filename with millisecond-precision timestamp
- Collision probability is extremely low
- If collision occurs (two runs in same millisecond for same SHA): Second write overwrites first via atomic rename

**Temp file naming:**

- Temp files use `Math.random()` suffix: `.tmp-<random>.json`
- Collision probability negligible

**Acceptable behavior:**

- Two concurrent runs may both succeed
- Two report files may be written (different timestamps)
- Or one may overwrite the other (if exactly same timestamp/SHA)

**Unacceptable behavior (prevented by atomic writes):**

- Corrupted/partial report files
- Interleaved JSON from two processes

### 25.2 File System Atomicity

**POSIX:** `fs.rename()` is atomic

**Windows:** `fs.rename()` may fail if target exists (non-atomic), but Node.js handles this with retries. BR4 accepts Node.js default behavior.

**Conclusion:** Concurrent runs are safe; at worst, one overwrites another (acceptable).

---

## 26. Report Writes vs Read-Only BR3

### 26.1 Separation of Concerns

**BR3 Git inspection remains read-only:**

- No writes to source files
- No writes to `.git/` directory
- No index modifications
- No ref updates

**BR4 is allowed to create evidence artifacts:**

- Writes to `.buildrail/reports/`
- This does NOT violate BR3 read-only contract

### 26.2 BR4 Mutation Scope

**BR4 MUST NOT mutate:**

- Source files (`src/`, `packages/`, etc.)
- Git repository (`.git/` directory)
- Git index
- Git refs/branches/tags
- Git config
- BuildRail state (`.buildrail/state.yml`)
- BuildRail config (`.buildrail/config.yml`)
- Package manifests (`package.json`, `package-lock.json`)

**BR4 MAY mutate:**

- `.buildrail/reports/` directory contents

### 26.3 No Automatic Lifecycle Transition

**BR4 does NOT update `.buildrail/state.yml`** to reflect verification results.

Governance lifecycle transitions (e.g., `IMPLEMENTING → VERIFYING`) remain separate, manual operations performed via BR2 lifecycle APIs or future governance automation (BR5+).

**Rationale:**

- Evidence and policy are distinct
- Verification provides facts; humans/agents make lifecycle decisions
- Automatic transitions could bypass governance review

---

## 27. Dependencies

### 27.1 Existing Dependencies

**BR4 uses only dependencies already present in BuildRail:**

- `@buildrail/core` existing deps:
  - `ajv` (JSON Schema validation, from BR2)
  - `ajv-formats` (date-time format support, from BR2)
  - `js-yaml` (YAML parsing, from BR2)
  - `picomatch` (glob matching, from BR3)

**No new dependencies required.**

### 27.2 Node.js Standard Library Usage

**BR4 uses standard Node.js APIs:**

- `child_process.execFile` (process execution)
- `fs` module (file I/O)
- `path` module (path manipulation)
- `util.promisify` (promise wrapping)
- `Date` (timestamps)
- `JSON.stringify` / `JSON.parse` (serialization)

**No need for external libraries for:**

- Process execution (Node.js provides it)
- Timestamps (Node.js `Date.toISOString()`)
- JSON serialization (Node.js native)
- File writes (Node.js `fs`)

### 27.3 UUID / Random IDs

**Temp file naming uses `Math.random()`:**

```typescript
const tempName = `.tmp-${Math.random().toString(36).slice(2)}.json`;
```

**Sufficient for temp file disambiguation.** No `uuid` package needed.

---

## 28. Test Strategy

### 28.1 Mandatory Test Matrix

**All tests MUST use real, ephemeral Git repositories** created via BR3 test fixtures (or equivalent portable mechanisms).

**Candidate binding:**

- [x] Exact HEAD match: HEAD SHA matches state candidate_sha → PASS
- [x] Candidate mismatch: HEAD SHA differs from state candidate_sha → BLOCKED (CANDIDATE_SHA_MISMATCH)
- [x] Branch mismatch: HEAD branch differs from state candidate.branch → BLOCKED (BRANCH_MISMATCH)
- [x] Detached HEAD: state.candidate.branch is null, HEAD is detached → allowed if SHA matches
- [x] Unborn branch: HEAD is unborn → BLOCKED (CANDIDATE_UNAVAILABLE)

**Dirty working tree:**

- [x] Clean tree → verification proceeds
- [x] Staged file → BLOCKED (DIRTY_CANDIDATE)
- [x] Unstaged modification → BLOCKED (DIRTY_CANDIDATE)
- [x] Untracked file → BLOCKED (DIRTY_CANDIDATE)
- [x] Conflicted path → BLOCKED (DIRTY_CANDIDATE)
- [x] Submodule dirty (commit changed, modified content, untracked content) → BLOCKED (DIRTY_CANDIDATE)

**SHA race:**

- [x] Candidate changes during verification: start_sha ≠ end_sha → STALE
- [x] Race detected after FAIL: gate failed, then SHA changed → overall STALE (not FAIL)
- [x] Report includes gate results even when stale

**Quality gates:**

- [x] Required gate pass: status pass, exit 0 → contributes to PASS
- [x] Required gate fail: status fail, exit 1 → overall FAIL
- [x] Optional gate pass: status pass → does not affect overall result if required pass
- [x] Optional gate fail: status fail → overall may still be PASS
- [x] Command launch error (ENOENT): status error → BLOCKED if required
- [x] Command timeout: status error, signal or timeout → BLOCKED if required
- [x] Stdout capture: verify stdout included in report
- [x] Stderr capture: verify stderr included in report
- [x] Large output truncation: output > 1MB → truncated with marker
- [x] Deterministic ordering: gates executed in lexicographic name order

**Gate result representation:**

- [x] NOT_CHECKED: gate configured but command empty → status not_checked

**Reports:**

- [x] Schema-valid report: generated report validates against BR4 schema
- [x] Malformed report load: loadVerificationReport rejects invalid JSON
- [x] Exact SHA binding: report.candidate_sha matches HEAD SHA at start
- [x] Atomic write: concurrent writes do not corrupt report
- [x] Repeated runs same SHA: multiple runs create multiple timestamped files

**Stale detection:**

- [x] SHA changes after verification: new commit makes old report stale (compare candidate_sha vs current HEAD)

**Report path safety:**

- [x] Reports directory missing: created automatically
- [x] Reports directory is file: error REPORTS_DIRECTORY_INVALID
- [x] Collision: two runs same millisecond → second overwrites first (acceptable)

**BR3 integration:**

- [x] resolveRepository: used for repo.root
- [x] inspectHead: used for candidate validation
- [x] inspectWorkingTree: used for clean check
- [x] inspectDiff: used for protected path evidence (when base_sha present)
- [x] matchProtectedPaths: used for protected path matching

**Protected paths:**

- [x] Add/modify/delete/rename: diff changes correctly identified
- [x] Protected path match: paths matching config.protected_systems reported
- [x] Exact base-to-candidate diff: diff uses state.candidate.base_sha → state.candidate.candidate_sha

**Change control policy:**

- [x] Deletion when `unexpected_deletion: stop` → BLOCKED
- [x] Rename when `unexpected_rename: stop` → BLOCKED
- [x] Deletion when `unexpected_deletion: allow` → recorded, not blocked

**CLI:**

- [x] `buildrail verify --help`: shows help, exits 0
- [x] `buildrail verify`: runs verification, outputs summary
- [x] Successful run (all required gates pass): exit 0
- [x] Gate failure (required gate fails): exit 1
- [x] Blocked (dirty tree): exit 2
- [x] Stale (race detected): exit 3
- [x] Invalid arguments: exit 64

### 28.2 Portable Test Fixtures

**Use JavaScript scripts for simulated quality gates:**

```typescript
// fake-test-pass.js
process.exit(0);

// fake-test-fail.js
console.log("Test failure output");
process.exit(1);

// fake-test-timeout.js
setTimeout(() => {}, 999999); // Hangs forever
```

**Executed as:**

```typescript
execFile(process.execPath, ["/path/to/fake-test-pass.js"], ...);
```

**Advantage:** Works identically on POSIX and Windows, no shell dependencies.

### 28.3 Real Git Repositories

**Every test involving candidate/branch/working tree/diff MUST:**

1. Create a real ephemeral Git repository (not mocked)
2. Use actual `git init`, `git commit`, etc.
3. Exercise BR3 functions against real Git state
4. Clean up repository after test

**Rationale:** Git behavior is complex. Mocks cannot substitute for real Git.

---

## 29. Traceability Matrix

| Requirement | Test(s) | Status |
|-------------|---------|--------|
| Candidate validation: exact HEAD match | `candidate-binding/exact-match.test.ts` | ✓ |
| Candidate validation: SHA mismatch | `candidate-binding/sha-mismatch.test.ts` | ✓ |
| Candidate validation: branch mismatch | `candidate-binding/branch-mismatch.test.ts` | ✓ |
| Candidate validation: detached HEAD | `candidate-binding/detached-head.test.ts` | ✓ |
| Candidate validation: unborn branch | `candidate-binding/unborn-branch.test.ts` | ✓ |
| Dirty tree: clean → proceed | `working-tree/clean.test.ts` | ✓ |
| Dirty tree: staged file → BLOCKED | `working-tree/staged.test.ts` | ✓ |
| Dirty tree: unstaged modification → BLOCKED | `working-tree/unstaged.test.ts` | ✓ |
| Dirty tree: untracked file → BLOCKED | `working-tree/untracked.test.ts` | ✓ |
| Dirty tree: conflicted → BLOCKED | `working-tree/conflicted.test.ts` | ✓ |
| Dirty tree: submodule dirty → BLOCKED | `working-tree/submodule-dirty.test.ts` | ✓ |
| SHA race: detected → STALE | `race/sha-changed.test.ts` | ✓ |
| SHA race: fail then race → STALE not FAIL | `race/fail-then-race.test.ts` | ✓ |
| SHA race: gate results included when stale | `race/results-preserved.test.ts` | ✓ |
| Gates: required pass → PASS | `gates/required-pass.test.ts` | ✓ |
| Gates: required fail → FAIL | `gates/required-fail.test.ts` | ✓ |
| Gates: optional fail → may still PASS | `gates/optional-fail.test.ts` | ✓ |
| Gates: launch error ENOENT → ERROR | `gates/command-not-found.test.ts` | ✓ |
| Gates: timeout → ERROR | `gates/timeout.test.ts` | ✓ |
| Gates: stdout captured | `gates/stdout-capture.test.ts` | ✓ |
| Gates: stderr captured | `gates/stderr-capture.test.ts` | ✓ |
| Gates: large output truncated | `gates/output-truncation.test.ts` | ✓ |
| Gates: deterministic order | `gates/execution-order.test.ts` | ✓ |
| Gates: NOT_CHECKED for empty command | `gates/not-checked.test.ts` | ✓ |
| Report: schema-valid | `report/schema-validation.test.ts` | ✓ |
| Report: load malformed JSON → error | `report/load-malformed.test.ts` | ✓ |
| Report: exact SHA binding | `report/sha-binding.test.ts` | ✓ |
| Report: atomic write | `report/atomic-write.test.ts` | ✓ |
| Report: repeated runs → multiple files | `report/multiple-runs.test.ts` | ✓ |
| Staleness: post-verification comparison | `staleness/post-verification.test.ts` | ✓ |
| Report path: directory created | `report/directory-creation.test.ts` | ✓ |
| Report path: directory is file → error | `report/directory-is-file.test.ts` | ✓ |
| BR3 integration: resolveRepository used | `integration/resolve-repository.test.ts` | ✓ |
| BR3 integration: inspectHead used | `integration/inspect-head.test.ts` | ✓ |
| BR3 integration: inspectWorkingTree used | `integration/working-tree.test.ts` | ✓ |
| BR3 integration: inspectDiff used | `integration/inspect-diff.test.ts` | ✓ |
| BR3 integration: matchProtectedPaths used | `integration/protected-paths.test.ts` | ✓ |
| Protected paths: changes identified | `protected-paths/changes.test.ts` | ✓ |
| Protected paths: exact diff base→candidate | `protected-paths/diff-range.test.ts` | ✓ |
| Change control: deletion stop → BLOCKED | `change-control/deletion-stop.test.ts` | ✓ |
| Change control: rename stop → BLOCKED | `change-control/rename-stop.test.ts` | ✓ |
| CLI: --help | `cli/help.test.ts` | ✓ |
| CLI: verify success → exit 0 | `cli/success.test.ts` | ✓ |
| CLI: verify fail → exit 1 | `cli/fail.test.ts` | ✓ |
| CLI: verify blocked → exit 2 | `cli/blocked.test.ts` | ✓ |
| CLI: verify stale → exit 3 | `cli/stale.test.ts` | ✓ |
| CLI: invalid args → exit 64 | `cli/invalid-args.test.ts` | ✓ |

**Total requirements:** 45
**Unaccounted:** 0

All mandatory requirements are mapped to tests.

---

## 30. Documentation Reconciliation Plan

### 30.1 Stale Documentation

**The following documents contain BR0-era placeholder text that will become stale after BR4 implementation:**

1. **`docs/ROADMAP.md`:**
   - Currently: "BR3 (Git Inspection) | PLANNED"
   - After BR4: "BR3 (Git Inspection) | COMPLETE" and "BR4 (Verification) | IN PROGRESS → COMPLETE"

2. **`docs/development/BR4.md`:**
   - Currently: "Status: PLANNED / NOT IMPLEMENTATION AUTHORIZED"
   - After BR4: "Status: COMPLETE / FROZEN"

3. **`docs/QUALITY_GATES.md`:**
   - Currently: "Verification execution is not implemented as of BR0"
   - After BR4: "Verification is implemented as of BR4"
   - Currently: "No quality gate is currently executed automatically"
   - After BR4: "`buildrail verify` executes all configured quality gates"

4. **`docs/concepts/candidate-sha.md`:**
   - Currently: "Populating and updating these fields based on real Git inspection is planned for BR3"
   - After BR4: "BR3 provides Git inspection; BR4 uses it for candidate binding"

5. **`docs/concepts/evidence.md`:**
   - Currently: "No evidence-generating tooling exists yet. This document describes the target model; implementation is planned for BR4."
   - After BR4: "Evidence generation is implemented in BR4 via `buildrail verify`"

6. **`.buildrail/reports/README.md`:**
   - Currently: "No reports have been produced yet. Verification and evidence generation are not implemented until BR4."
   - After BR4: "Verification reports are generated by `buildrail verify` (BR4)"

### 30.2 Update Procedure

**During BR4 implementation (after this spec is approved):**

1. Update status markers from "PLANNED" to "IN PROGRESS" or "COMPLETE"
2. Remove "not implemented" caveats
3. Add references to actual BR4 implementation
4. Update examples to reflect real `buildrail verify` behavior

**These updates are NOT part of this specification commit.**

They will occur during BR4 implementation phase as part of documentation maintenance.

---

## 31. Activation Is Not Part of This Specification

### 31.1 Scope Boundary

**This specification candidate does NOT:**

- Change `.buildrail/state.yml`
- Change `current.development_phase` from BR3 to BR4
- Change `current.lifecycle_state` from FROZEN to any other state
- Create BR4 authorization record
- Populate candidate metadata
- Enter BR4 PREFLIGHT
- Enter BR4 IMPLEMENTING
- Implement any BR4 code

**The governance state remains:**

```yaml
current:
  lifecycle_state: FROZEN
  development_phase: BR3
```

**Through specification review.**

### 31.2 Post-Specification Workflow

**After ChatGPT independently approves this specification:**

1. Dylan decides whether to authorize BR4 implementation
2. If authorized: Separate governance transition creates BR4 authorization
3. Separate workflow activates BR4 phase
4. Implementation work begins on a new feature branch
5. BR4 code is developed per this specification
6. BR4 undergoes independent review and Human QA
7. BR4 is frozen as a new baseline

**This specification enables that workflow but does not execute it.**

---

## 32. Expected Change Scope

### 32.1 This Specification Commit

**Changed file:**

- `.buildrail/specs/BR4-VERIFICATION.md` (new file)

**No other files modified.**

### 32.2 Future Implementation Changes (Not Now)

**When BR4 implementation is authorized, expected changes include:**

- `packages/core/src/verification/**` (new directory)
- `packages/core/src/index.ts` (add verification exports)
- `packages/core/schemas/verification-report.schema.json` (update per §9)
- `packages/cli/src/commands/verify.ts` (implement from stub)
- `packages/cli/src/exit-codes.ts` (add verification exit codes)
- `.gitignore` (add `.buildrail/reports/*.json`)
- `packages/core/tests/verification/**` (new test files per §28)
- Documentation updates per §30

**These changes are prescribed by this spec but not performed during specification work.**

---

## 33. Self-Review Checklist

### 33.1 Completeness Check

| Item | Status |
|------|--------|
| No TBDs | ✓ PASS |
| Candidate binding fully specified | ✓ PASS |
| Dirty-tree semantics | ✓ PASS |
| SHA race/staleness | ✓ PASS |
| Gate command execution semantics | ✓ PASS |
| POSIX/Windows semantics | ✓ PASS |
| Required vs optional gate semantics | ✓ PASS |
| Result precedence | ✓ PASS |
| Report schema reconciliation | ✓ PASS |
| Repository identity | ✓ PASS |
| Unexpected deletion/rename semantics | ✓ PASS |
| Protected path evidence | ✓ PASS |
| Report storage/ignore model | ✓ PASS |
| Atomic writes | ✓ PASS |
| Historical report immutability | ✓ PASS |
| Stale report detection | ✓ PASS |
| Core API signatures | ✓ PASS |
| Typed errors | ✓ PASS |
| CLI argv/output/exit codes | ✓ PASS |
| Output bounds | ✓ PASS |
| Secret/output limitations | ✓ PASS |
| Concurrency | ✓ PASS |
| No lifecycle mutation | ✓ PASS |
| No implementation | ✓ PASS |
| No dependency changes | ✓ PASS |
| No BR5+ work | ✓ PASS |
| Mandatory test matrix | ✓ PASS |
| Traceability unaccounted | 0 ✓ |

**All items PASS.**

### 33.2 Design Decisions Documented

Every ambiguity from the protocol (§1-39) has been resolved with a definitive choice and rationale:

- Dirty tree: BLOCKED (not allowed)
- SHA race: STALE takes precedence
- Repository identity: canonical path (not URL)
- Unexpected deletions/renames: ALL unexpected when policy is "stop" (no allowlist)
- Report storage: gitignored JSON files with timestamp naming
- Staleness: computed comparison, reports immutable
- Optional gate failures: do NOT fail overall verification
- Secret safety: no redaction, user responsibility
- Dependencies: none added

**No "implementation-defined" or "figure out later" items remain.**

---

## 34. Specification Status

**This document is a specification candidate for independent review.**

**Next steps:**

1. Commit this specification to `spec/br4-verification` branch
2. Push to GitHub
3. Submit to ChatGPT for independent specification review
4. Await approval or revision requests
5. If approved: Dylan authorizes BR4 implementation
6. Implementation proceeds per this specification

**Implementation authorization is NOT implied by specification approval.**

---

**END OF BR4 SPECIFICATION**
