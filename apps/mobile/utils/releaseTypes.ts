import type { TFunction } from "i18next";
import type { AlbumID3 } from "@/services/openSubsonic/types";

// Prefixed so it can never collide with a real tag: freeform tags are read
// verbatim, so a file tagged "Untagged" would otherwise produce two options
// sharing one key.
export const UNTAGGED_RELEASE_TYPE = "__untagged";

const RELEASE_TYPE_ORDER = [
  "album",
  "ep",
  "single",
  "compilation",
  "live",
  "soundtrack",
  "remix",
  "djmix",
  "mixtapestreet",
  "demo",
  "broadcast",
  "spokenword",
  "interview",
  "audiobook",
  "audiodrama",
  "fieldrecording",
  "other",
];

export function releaseTypeKey(type: string): string {
  return type
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

export function formatReleaseTypes(
  releaseTypes: string[],
  t: TFunction,
): string {
  return releaseTypes.map((type) => translateReleaseType(type, t)).join(" · ");
}

export function translateReleaseType(type: string, t: TFunction): string {
  const fallback =
    type.toLowerCase() === "ep"
      ? type.toUpperCase()
      : type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return t(`app.albums.releaseTypes.${releaseTypeKey(type)}`, {
    defaultValue: fallback,
  });
}

export type ReleaseTypeFilterOption = { key: string; label: string };

// Options come from the albums in hand rather than from the server type: a
// backend that never sends releaseTypes (Jellyfin) and an artist whose files
// are simply untagged both end up with nothing to offer, and the caller hides
// the row on option count alone.
export function collectReleaseTypeFilters(
  albums: AlbumID3[],
): ReleaseTypeFilterOption[] {
  const options = new Map<string, ReleaseTypeFilterOption>();
  let hasUntagged = false;
  for (const album of albums) {
    let tagged = false;
    for (const type of album.releaseTypes ?? []) {
      const key = releaseTypeKey(type);
      if (!key) continue;
      tagged = true;
      if (!options.has(key)) options.set(key, { key, label: type });
    }
    if (!tagged) hasUntagged = true;
  }
  const sorted = [...options.values()].sort((a, b) => {
    const aRank = RELEASE_TYPE_ORDER.indexOf(a.key);
    const bRank = RELEASE_TYPE_ORDER.indexOf(b.key);
    if (aRank !== bRank) {
      if (aRank === -1) return 1;
      if (bRank === -1) return -1;
      return aRank - bRank;
    }
    return a.label.localeCompare(b.label);
  });
  if (hasUntagged) {
    sorted.push({ key: UNTAGGED_RELEASE_TYPE, label: UNTAGGED_RELEASE_TYPE });
  }
  return sorted;
}

export function albumMatchesReleaseTypes(
  album: AlbumID3,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const keys = (album.releaseTypes ?? [])
    .map(releaseTypeKey)
    .filter((key) => key.length > 0);
  if (!keys.length) return selected.includes(UNTAGGED_RELEASE_TYPE);
  return keys.some((key) => selected.includes(key));
}
