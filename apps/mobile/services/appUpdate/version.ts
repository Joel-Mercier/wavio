import type { SemVer } from "@/services/appUpdate/types";

// Parses "1.0.8", "v1.0.8" or "v1.0.8-beta.1" into its numeric core. GitHub tags
// carry a leading "v"; app versions (Application.nativeApplicationVersion) don't.
// Anything that doesn't start with three numeric components is rejected (null),
// so a malformed tag is simply ignored rather than treated as an update.
export function parseVersion(input: string | null | undefined): SemVer | null {
  if (!input) return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(input.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

// True when `latest` is a strictly higher version than `current`. Either side
// failing to parse yields false — we never prompt on ambiguous input.
export function isNewer(
  latest: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}
