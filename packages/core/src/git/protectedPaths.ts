import picomatch from "picomatch";
import type { ProtectedSystem } from "../config/types.js";
import type { ProtectedPathCheckInput, ProtectedPathMatch, ProtectedPathMatchResult } from "./types.js";

function stripLeadingDotSlash(p: string): string {
  return p.startsWith("./") ? p.slice(2) : p;
}

function stripLeadingSlash(p: string): string {
  return p.startsWith("/") ? p.slice(1) : p;
}

function normalize(p: string): string {
  return stripLeadingSlash(stripLeadingDotSlash(p));
}

function containsDotDotSegment(p: string): boolean {
  return p.split("/").some((seg) => seg === "..");
}

type Matcher = (input: string) => boolean;

function compileMatcher(pattern: string): Matcher | null {
  try {
    return picomatch(pattern, {
      dot: true,
      nocase: false,
      windows: false,
      basename: false,
      nonegate: true,
      noextglob: true,
    });
  } catch {
    return null;
  }
}

interface CompiledSystem {
  system: ProtectedSystem;
  systemIndex: number;
  matchers: Matcher[];
}

function canonicalPathsKey(paths: string[]): string {
  return paths.map((p) => normalize(p)).join("\n");
}

export function matchProtectedPaths(
  inputs: ProtectedPathCheckInput[],
  protectedSystems: ProtectedSystem[],
): ProtectedPathMatchResult {
  const invalidInputs: ProtectedPathCheckInput[] = [];
  const invalidPatterns: string[] = [];

  const validInputs: { input: ProtectedPathCheckInput; normalizedPath: string }[] = [];
  for (const input of inputs) {
    const normalizedPath = normalize(input.path);
    if (containsDotDotSegment(normalizedPath)) {
      invalidInputs.push(input);
      continue;
    }
    validInputs.push({ input, normalizedPath });
  }

  const compiledSystems: CompiledSystem[] = [];
  for (const [systemIndex, system] of protectedSystems.entries()) {
    const matchers: Matcher[] = [];
    for (const pattern of system.paths) {
      const normalizedPattern = normalize(pattern);
      if (containsDotDotSegment(normalizedPattern)) {
        invalidPatterns.push(pattern);
        continue;
      }
      const matcher = compileMatcher(normalizedPattern);
      if (matcher === null) {
        invalidPatterns.push(pattern);
        continue;
      }
      matchers.push(matcher);
    }
    if (matchers.length > 0) {
      compiledSystems.push({ system, systemIndex, matchers });
    }
  }

  const matches: ProtectedPathMatch[] = [];
  for (const { input, normalizedPath } of validInputs) {
    const matchedVia: ProtectedPathMatch["matchedVia"] = input.origin === "current" ? "path" : "oldPath";
    for (const cs of compiledSystems) {
      if (cs.matchers.some((m) => m(normalizedPath))) {
        matches.push({ path: input.path, matchedVia, system: cs.system });
      }
    }
  }

  const systemIndexOf = new Map<ProtectedSystem, number>();
  for (const cs of compiledSystems) {
    systemIndexOf.set(cs.system, cs.systemIndex);
  }

  matches.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.matchedVia !== b.matchedVia) return a.matchedVia === "path" ? -1 : 1;
    if (a.system.name !== b.system.name) return a.system.name < b.system.name ? -1 : 1;
    if (a.system.status !== b.system.status) return a.system.status < b.system.status ? -1 : 1;
    const pathsKeyA = canonicalPathsKey(a.system.paths);
    const pathsKeyB = canonicalPathsKey(b.system.paths);
    if (pathsKeyA !== pathsKeyB) return pathsKeyA < pathsKeyB ? -1 : 1;
    const idxA = systemIndexOf.get(a.system) ?? 0;
    const idxB = systemIndexOf.get(b.system) ?? 0;
    return idxA - idxB;
  });

  return { matches, invalidInputs, invalidPatterns };
}
