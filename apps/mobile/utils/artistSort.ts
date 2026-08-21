import type { ArtistID3 } from "@/services/openSubsonic/types";
import { sortKey } from "@/services/pinyinIndex";
import { type SortFieldSpecs, type SortType, sortTime } from "@/utils/sort";

// Sorting for the whole-library artist browse
// (components/artists/AllArtistsScreen). Unlike the album and track browses,
// this one is not paginated — getArtists returns the entire index in one
// response on every backend — so the whole list is already in memory and sorts
// client-side, which also means it works unchanged on the offline fallback and
// needs no per-backend gate. The field set is simply what ArtistID3 carries.

export type ArtistSortField =
  | "alphabetical"
  | "albumCount"
  | "rating"
  | "favoritedAt";

export type ArtistSortType = SortType<ArtistSortField>;

// The order the browse had before it could sort (the backend's own index).
export const DEFAULT_ARTIST_SORT: ArtistSortType = "alphabeticalAsc";

// Sheet row order.
export const ARTIST_SORT_FIELDS: ArtistSortField[] = [
  "alphabetical",
  "albumCount",
  "rating",
  "favoritedAt",
];

// Built per `ignoredArticles` rather than exported as a constant: the name key
// has to be the same one the section index buckets on
// (buildArtistIndex → sortKey(name, ignoredArticles)), or a flat alphabetical
// sort and the sectioned one disagree about where an article-prefixed name
// belongs — "The Beatles" tiebreaking under `t` while the index files it
// under `b`. The key is cached per name because it is also every other field's
// tiebreaker, `albumCount` ties constantly (most artists have one album), and
// on a CJK library each miss costs a pinyin conversion.
//
// `zeroIsEmpty` plus `availableSortFields` is what hides an option a backend
// has no data for, rather than a capability flag: Jellyfin's
// /Artists/AlbumArtists never reports AlbumCount (services/jellyfin/mappers.ts),
// and a library nobody has rated offers no rating sort.
export function artistSortSpecs(
  ignoredArticles?: string,
): SortFieldSpecs<ArtistID3, ArtistSortField> {
  const keys = new Map<string, string>();
  const name = (artist: ArtistID3) => {
    const raw = artist.name ?? "";
    let key = keys.get(raw);
    if (key === undefined) {
      key = sortKey(raw, ignoredArticles);
      keys.set(raw, key);
    }
    return key;
  };

  return {
    alphabetical: { value: name, always: true },
    albumCount: {
      value: (artist) => artist.albumCount,
      zeroIsEmpty: true,
      tiebreakers: [name],
    },
    rating: {
      value: (artist) => artist.userRating,
      zeroIsEmpty: true,
      tiebreakers: [name],
    },
    favoritedAt: {
      value: (artist) => sortTime(artist.starred),
      tiebreakers: [name],
    },
  };
}
