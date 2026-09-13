export const HELP_TEXT = `BuildRail

Governance for AI-assisted software development.

Usage:
  buildrail <command> [options]

Commands:
  init        Show initialization availability
  status      Show status availability
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

Reports whether BuildRail governance status inspection is available.

Usage:
  buildrail status [options]

Options:
  --help, -h    Show this help

BR1 status: state-backed status reporting is not implemented yet. This
command reports that boundary truthfully and does not read any BuildRail
governance files.
`;

export const INIT_UNAVAILABLE_TEXT = `BuildRail initialization is not available yet.

The CLI shell is installed successfully.
Project initialization is implemented in a later BuildRail phase.
`;

export const STATUS_UNAVAILABLE_TEXT = `BuildRail status requires the governance engine.

CLI command routing is working.
State inspection will become available after the governance engine is
implemented.
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
