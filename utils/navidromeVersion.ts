export type SemVer = [number, number, number];

export function parseServerVersion(
  raw: string | null | undefined,
): SemVer | null {
  if (!raw) return null;
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersion(a: SemVer, b: SemVer): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function gte(version: SemVer | null, target: SemVer): boolean {
  if (!version) return false;
  return compareVersion(version, target) >= 0;
}

export const SMART_PLAYLIST_MIN_VERSION: SemVer = [0, 49, 0];
export const MULTI_FIELD_SORT_MIN_VERSION: SemVer = [0, 53, 0];

export function supportsSmartPlaylists(
  raw: string | null | undefined,
): boolean {
  return gte(parseServerVersion(raw), SMART_PLAYLIST_MIN_VERSION);
}

export function supportsMultiFieldSort(
  raw: string | null | undefined,
): boolean {
  return gte(parseServerVersion(raw), MULTI_FIELD_SORT_MIN_VERSION);
}
