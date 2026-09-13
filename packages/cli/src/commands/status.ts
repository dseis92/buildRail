import { EXIT_OPERATION_UNAVAILABLE, EXIT_SUCCESS } from "../exit-codes.js";
import { STATUS_HELP_TEXT, STATUS_UNAVAILABLE_TEXT } from "../output/text.js";
import type { CommandResult } from "./init.js";

export function runStatus(showHelp: boolean): CommandResult {
  if (showHelp) {
    return { stdout: STATUS_HELP_TEXT, exitCode: EXIT_SUCCESS };
  }

  return { stdout: STATUS_UNAVAILABLE_TEXT, exitCode: EXIT_OPERATION_UNAVAILABLE };
}
