export const HELP_TEXT = `BuildRail

Governance for AI-assisted software development.

Usage:
  buildrail <command> [options]

Commands:
  init        Show initialization availability
  status      Show governance status
  help        Show help

Options:
  --help, -h       Show help
  --version, -v    Show version

Build with AI agents without losing control of project state,
authorization, verification, or approved work.
`;

export const INIT_HELP_TEXT = `buildrail init

Reports whether BuildRail project initialization is available.

Usage:
  buildrail init [options]

Options:
  --help, -h    Show this help

BR1 status: initialization is not implemented yet. This command reports
that boundary truthfully and does not create or modify any files.
`;

export const STATUS_HELP_TEXT = `buildrail status

Reports BuildRail governance status: project, development phase,
lifecycle state, authorization, completed phases, baselines, and any
in-progress candidate — all read from .buildrail/config.yml and
.buildrail/state.yml in the current directory.

Usage:
  buildrail status [options]

Options:
  --help, -h    Show this help

Governance files are resolved relative to the current working directory
only (no parent-directory search, no Git-repository discovery). This
command performs no Git inspection of its own — any branch/SHA-shaped
values shown are exactly what is recorded in state.yml, not queried live.
`;

export const INIT_UNAVAILABLE_TEXT = `BuildRail initialization is not available yet.

The CLI shell is installed successfully.
Project initialization is implemented in a later BuildRail phase.
`;

export function unknownCommandError(command: string): string {
  return `BuildRail could not run this command.

Reason:
Unknown command: ${command}

Try:
buildrail --help
`;
}

export function invalidUsageError(reason: string): string {
  return `BuildRail could not run this command.

Reason:
${reason}

Try:
buildrail --help
`;
}
