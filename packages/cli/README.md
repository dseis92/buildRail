# @buildrail/cli

The `buildrail` command-line interface.

## Status

**BR1 — CLI skeleton implemented.** This package now provides a real,
executable CLI shell: argument parsing, command routing, help, version
reporting, and predictable exit codes. It does **not** implement any
governance logic — `buildrail init` and `buildrail status` are truthful
command shells that report their BR1 boundary and perform no real
initialization or state inspection. See
`.buildrail/specs/BR1-CLI-SKELETON.md` for the full BR1 contract, and
`docs/development/BR2.md` onward for when real governance behavior lands.

## Requirements

- Node.js `>=22`

## Command surface

```
buildrail --help | -h | help    Show help
buildrail --version | -v        Show the installed package version
buildrail init [--help]         Report initialization availability (not implemented yet)
buildrail status [--help]       Report status availability (not implemented yet)
```

`buildrail init` and `buildrail status` are registered and callable, but
neither performs the real operation its name suggests yet — both exit `1`
to indicate the requested operation could not be performed, and print a
truthful explanation. Passing `--help` to either shows command-specific
help and exits `0`.

## Development

From the repository root:

```
npm run build       # compile TypeScript to packages/cli/dist/
npm run typecheck    # type-check without emitting output
npm test             # build, then run the behavioral CLI test suite
```

Or from this package directory:

```
npm run build
npm run typecheck
npm test
npm run clean        # remove dist/ and dist-tests/
```

Lint is not yet configured for this package (`npm run lint` at the
repository root remains a placeholder until lint tooling is introduced).

## Build / execution model

Source lives under `src/` and compiles via `tsc` to `dist/`. The package's
`bin` and `main` fields point at the compiled JavaScript
(`dist/index.js`), never at TypeScript source — the compiled entry point
begins with a `#!/usr/bin/env node` shebang. Running the CLI requires only
a plain Node.js `>=22` installation; no TypeScript runtime (`tsx`,
`ts-node`, Bun, Deno) is required at runtime.

## Version source of truth

`buildrail --version` / `-v` read the running package's version directly
from this package's own `package.json` at runtime (see
`src/output/version.ts`). The version is not duplicated as a separate
hard-coded string anywhere else in source.

## Dependencies

No runtime dependencies. Argument parsing uses Node's built-in
`util.parseArgs`; tests use Node's built-in `node:test` and
`node:assert`. Development-only dependencies: `typescript` and
`@types/node`, used for compiling and type-checking this package.

## Testing

Behavioral tests live under `tests/` and exercise the *built* CLI
executable as a subprocess (not the internal parser directly), so they
remain valid regardless of internal implementation changes. `npm test`
compiles both the CLI and the test suite before running them.
