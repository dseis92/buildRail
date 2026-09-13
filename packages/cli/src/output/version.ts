import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface PackageManifest {
  version: string;
}

export function getPackageVersion(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(moduleDir, "..", "..", "package.json");
  const raw = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as PackageManifest;
  return manifest.version;
}
