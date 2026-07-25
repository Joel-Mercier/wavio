import type { BackendCapabilities } from "@/services/backend/capabilities";
import type { Genre } from "@/services/openSubsonic/types";
import type { GenreSortField } from "@/stores/app";
import type { SortFieldSpecs } from "@/utils/sort";

// Field specs (see utils/sort.ts) for the genre grid on the search screen.

// Sheet row order.
export const GENRE_SORT_FIELDS: GenreSortField[] = [
  "alphabetical",
  "songCount",
  "albumCount",
];

export const GENRE_SORT_SPECS: SortFieldSpecs<Genre, GenreSortField> = {
  alphabetical: { value: (genre) => genre.value, always: true },
  songCount: { value: (genre) => genre.songCount, zeroIsEmpty: true },
  albumCount: { value: (genre) => genre.albumCount, zeroIsEmpty: true },
};

// Only the counts depend on the backend (getGenres doesn't return them on
// Jellyfin); the name is always there, so alphabetical is always offerable.
export function genreSortEnabled(
  capabilities: Pick<BackendCapabilities, "genreCounts">,
): (field: GenreSortField) => boolean {
  return (field) => field === "alphabetical" || capabilities.genreCounts;
}
