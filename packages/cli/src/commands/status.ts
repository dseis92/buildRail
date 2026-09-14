import { EXIT_OPERATION_UNAVAILABLE, EXIT_SUCCESS } from "../exit-codes.js";
import { STATUS_HELP_TEXT } from "../output/text.js";
import type { CommandResult } from "./init.js";
import {
  loadConfig,
  loadState,
  isAuthorizationActive,
  type BuildRailState,
  type BuildRailError,
} from "@buildrail/core";

function formatError(error: BuildRailError): string {
  const lines = [
    "BuildRail status could not be determined.",
    "",
    `Reason: ${error.message}`,
    `Code: ${error.code}`,
  ];
  if (error.path) {
    lines.push(`Path: ${error.path}`);
  }
  return lines.join("\n") + "\n";
}

function formatAuthorization(state: BuildRailState): string {
  const authorization = state.authorization;
  if (!authorization) {
    return "  none";
  }
  const active = isAuthorizationActive(state) ? "active" : "not active";
  return `  ${authorization.id} / ${authorization.title} — ${authorization.status} (${active})`;
}

function formatCandidate(state: BuildRailState): string {
  const candidate = state.candidate;
  if (!candidate || (candidate.branch === null && candidate.base_sha === null && candidate.candidate_sha === null)) {
    return "Candidate: none";
  }
  const lines = ["Candidate:"];
  lines.push(`  branch: ${candidate.branch ?? "null"}`);
  lines.push(`  base_sha: ${candidate.base_sha ?? "null"}`);
  lines.push(`  candidate_sha: ${candidate.candidate_sha ?? "null"}`);
  return lines.join("\n");
}

function formatBaselines(state: BuildRailState): string {
  const baselines = state.baselines;
  if (!baselines || Object.keys(baselines).length === 0) {
    return "Baselines: none";
  }
  const lines = ["Baselines:"];
  for (const [phase, baseline] of Object.entries(baselines)) {
    lines.push(`  ${phase} → ${baseline.approved_sha} (${baseline.status})`);
  }
  return lines.join("\n");
}

function formatSuccess(state: BuildRailState): string {
  const lines = [
    "BuildRail status",
    "",
    `Project: ${state.project.name}`,
    `Development phase: ${state.current.development_phase}`,
    `Lifecycle state: ${state.current.lifecycle_state}`,
    "",
    "Authorization:",
    formatAuthorization(state),
    "",
    `Completed phases: ${state.completed_phases.length > 0 ? state.completed_phases.join(", ") : "none"}`,
    formatBaselines(state),
    "",
    formatCandidate(state),
    "",
    "Governance documents: valid",
  ];
  return lines.join("\n") + "\n";
}

export async function runStatus(showHelp: boolean): Promise<CommandResult> {
  if (showHelp) {
    return { stdout: STATUS_HELP_TEXT, exitCode: EXIT_SUCCESS };
  }

  const projectRoot = process.cwd();

  const configResult = await loadConfig(projectRoot);
  if (!configResult.ok) {
    return { stdout: formatError(configResult.error), exitCode: EXIT_OPERATION_UNAVAILABLE };
  }

  const stateResult = await loadState(projectRoot);
  if (!stateResult.ok) {
    return { stdout: formatError(stateResult.error), exitCode: EXIT_OPERATION_UNAVAILABLE };
  }

  return { stdout: formatSuccess(stateResult.value.value), exitCode: EXIT_SUCCESS };
}
