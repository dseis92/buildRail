import { EXIT_OPERATION_UNAVAILABLE, EXIT_SUCCESS } from "../exit-codes.js";
import { INIT_HELP_TEXT, INIT_UNAVAILABLE_TEXT } from "../output/text.js";

export interface CommandResult {
  stdout: string;
  exitCode: number;
}

export function runInit(showHelp: boolean): CommandResult {
  if (showHelp) {
    return { stdout: INIT_HELP_TEXT, exitCode: EXIT_SUCCESS };
  }

  return { stdout: INIT_UNAVAILABLE_TEXT, exitCode: EXIT_OPERATION_UNAVAILABLE };
}
