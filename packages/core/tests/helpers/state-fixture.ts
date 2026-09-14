import type { BuildRailState, LifecycleState, Authorization } from "@buildrail/core";

export function makeState(overrides: Partial<BuildRailState> = {}): BuildRailState {
  return {
    schema_version: 1,
    project: { name: "FixtureProject" },
    current: { lifecycle_state: "IDEA", development_phase: "BR9" },
    completed_phases: [],
    planned_phases: [],
    review: { independent_review: "required", self_approval: "forbidden" },
    ...overrides,
  };
}

export function makeAuthorization(overrides: Partial<Authorization> = {}): Authorization {
  return {
    id: "BR9",
    type: "feature",
    title: "Fixture Phase",
    status: "authorized",
    specification: "x.md",
    granted_by: "human",
    ...overrides,
  };
}

export function withLifecycle(state: BuildRailState, lifecycle_state: LifecycleState): BuildRailState {
  return { ...state, current: { ...state.current, lifecycle_state } };
}
