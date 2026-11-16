import type { AlbumID3 } from "@/services/openSubsonic/types";

// The year of a reissue/remaster, when the album carries a release date later
// than the original one it is displayed with (issue #284).
export function laterReleaseYear(
  album:
    | Pick<AlbumID3, "year" | "originalReleaseDate" | "releaseDate">
    | undefined,
): number | undefined {
  const releaseYear = album?.releaseDate?.year;
  const shownYear = album?.originalReleaseDate?.year || album?.year;
  return releaseYear && shownYear && releaseYear > shownYear
    ? releaseYear
    : undefined;
}
