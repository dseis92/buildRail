import { parseArgs } from "node:util";
import { EXIT_INVALID_USAGE, EXIT_SUCCESS } from "./exit-codes.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { HELP_TEXT, invalidUsageError, unknownCommandError } from "./output/text.js";
import { getPackageVersion } from "./output/version.js";

export interface CliResult {
  stdout: string;
  exitCode: number;
}

const KNOWN_COMMANDS = new Set(["init", "status", "help"]);

export async function runCli(argv: string[]): Promise<CliResult> {
  if (argv.length === 0) {
    return { stdout: HELP_TEXT, exitCode: EXIT_SUCCESS };
  }

  const [first, ...rest] = argv;

  if (first === "--help" || first === "-h" || first === "help") {
    return { stdout: HELP_TEXT, exitCode: EXIT_SUCCESS };
  }

  if (first === "--version" || first === "-v") {
    return { stdout: `${getPackageVersion()}\n`, exitCode: EXIT_SUCCESS };
  }

  if (first.startsWith("-")) {
    return {
      stdout: invalidUsageError(`Unsupported option: ${first}`),
      exitCode: EXIT_INVALID_USAGE,
    };
  }

  if (!KNOWN_COMMANDS.has(first)) {
    return { stdout: unknownCommandError(first), exitCode: EXIT_INVALID_USAGE };
  }

  if (first === "init" || first === "status") {
    let showHelp: boolean;
    try {
      const parsed = parseArgs({
        args: rest,
        options: { help: { type: "boolean", short: "h" } },
        allowPositionals: false,
      });
      showHelp = parsed.values.help === true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { stdout: invalidUsageError(reason), exitCode: EXIT_INVALID_USAGE };
    }

    return first === "init" ? runInit(showHelp) : await runStatus(showHelp);
  }

  // Unreachable: "help" is the only remaining member of KNOWN_COMMANDS.
  return { stdout: HELP_TEXT, exitCode: EXIT_SUCCESS };
}
