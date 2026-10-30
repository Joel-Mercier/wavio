import type { AlbumID3 } from "@/services/openSubsonic/types";
import type { LibraryBucketFilter } from "@/stores/app";
import { ALBUM_SORT_SPECS } from "@/utils/albumSort";
import { seededRank } from "@/utils/shuffle";
import {
  availableSortFields,
  type SortDirection,
  type SortFieldSpecs,
  type SortType,
  type SortValue,
  sortTime,
} from "@/utils/sort";

// Sorting for the library index, which lists favorited albums and artists,
// playlists (and playlist folders), podcasts, radio stations and music folders
// in one list. Everything is in memory, so it all sorts client-side. A field is
// only offered when every kind of row on screen can carry it: an album-only
// field on a mixed list would just float the albums to the top and leave the
// rest in their old order.

export type LibrarySortField =
  | "addedAt"
  | "alphabetical"
  | "artist"
  | "year"
  | "lastPlayed"
  | "playCount"
  | "rating"
  | "albumCount"
  | "songCount"
  | "duration"
  | "random";

export type LibrarySort = SortType<LibrarySortField>;

export const DEFAULT_LIBRARY_SORT: LibrarySort = "addedAtAsc";

// Sheet row order.
export const LIBRARY_SORT_FIELDS: LibrarySortField[] = [
  "addedAt",
  "alphabetical",
  "artist",
  "year",
  "lastPlayed",
  "playCount",
  "rating",
  "albumCount",
  "songCount",
  "duration",
  "random",
];

export const LIBRARY_LOCKED_DIRECTIONS: Partial<
  Record<LibrarySortField, SortDirection | "none">
> = { random: "none" };

const SHARED_SORT_FIELDS: LibrarySortField[] = [
  "addedAt",
  "alphabetical",
  "random",
];

export const BUCKET_SORT_FIELDS: Record<
  LibraryBucketFilter,
  LibrarySortField[]
> = {
  albums: [
    ...SHARED_SORT_FIELDS,
    "artist",
    "year",
    "lastPlayed",
    "playCount",
    "rating",
    "songCount",
    "duration",
  ],
  artists: [...SHARED_SORT_FIELDS, "artist", "rating", "albumCount"],
  playlists: [...SHARED_SORT_FIELDS, "songCount", "duration"],
  podcasts: SHARED_SORT_FIELDS,
  radioStations: SHARED_SORT_FIELDS,
  folders: SHARED_SORT_FIELDS,
};

// The union of what every row shape on the index carries.
export type LibrarySortRow = {
  id: string;
  name?: string;
  starred?: Date | string;
  created?: Date | string;
  dateAdded?: number;
  artist?: string;
  displayArtist?: string;
  year?: number;
  played?: Date | string;
  playCount?: number;
  userRating?: number;
  albumCount?: number;
  songCount?: number;
  duration?: number;
};

// A row tagged with the bucket that listed it, so a field reads the right
// property for each kind of row instead of guessing the kind from its shape.
export type LibrarySortEntry = {
  bucket: LibraryBucketFilter;
  row: LibrarySortRow;
};

const asAlbum = (row: LibrarySortRow) => row as unknown as AlbumID3;

const name = ({ row }: LibrarySortEntry) => row.name;

function readFrom(
  buckets: LibraryBucketFilter[],
  read: (row: LibrarySortRow) => SortValue,
): (entry: LibrarySortEntry) => SortValue {
  return (entry) => (buckets.includes(entry.bucket) ? read(entry.row) : null);
}

// Each row shape carries at most one of these dates; 0 (rather than undefined)
// keeps undated rows sorting as "oldest" instead of being pinned last, which is
// how this list has always behaved.
function addedTime({ row }: LibrarySortEntry): number {
  const value = sortTime(row.starred ?? row.created);
  if (value !== undefined) return value;
  return typeof row.dateAdded === "number" ? row.dateAdded : 0;
}

// `seed` drives the random order: the same seed always lays the list out the
// same way, so only an explicit reshuffle moves rows around.
export function librarySortSpecs(
  seed: number,
): SortFieldSpecs<LibrarySortEntry, LibrarySortField> {
  return {
    addedAt: { value: addedTime, always: true },
    alphabetical: { value: name, always: true },
    // An artist's own name is its "artist", so with albums and artists listed
    // together each artist lands right above their albums.
    artist: {
      value: ({ bucket, row }) => {
        if (bucket === "artists") return row.name;
        if (bucket === "albums") {
          return ALBUM_SORT_SPECS.artist.value(asAlbum(row));
        }
        return null;
      },
      tiebreakers: [
        (entry) => (entry.bucket === "artists" ? 0 : 1),
        readFrom(["albums"], (row) => row.year),
        name,
      ],
    },
    year: {
      value: readFrom(["albums"], (row) =>
        ALBUM_SORT_SPECS.year.value(asAlbum(row)),
      ),
      tiebreakers: [name],
    },
    lastPlayed: {
      value: readFrom(["albums"], (row) =>
        ALBUM_SORT_SPECS.lastPlayed.value(asAlbum(row)),
      ),
      tiebreakers: [name],
    },
    playCount: {
      value: readFrom(["albums"], (row) =>
        ALBUM_SORT_SPECS.playCount.value(asAlbum(row)),
      ),
      zeroIsEmpty: true,
      tiebreakers: [name],
    },
    rating: {
      value: readFrom(["albums", "artists"], (row) => row.userRating),
      zeroIsEmpty: true,
      tiebreakers: [name],
    },
    // Jellyfin never reports an artist's album count (services/jellyfin/
    // mappers.ts), so its 0 means "unknown", not "no albums".
    albumCount: {
      value: readFrom(["artists"], (row) => row.albumCount),
      zeroIsEmpty: true,
      tiebreakers: [name],
    },
    songCount: {
      value: readFrom(["albums", "playlists"], (row) => row.songCount),
      tiebreakers: [name],
    },
    duration: {
      value: readFrom(["albums", "playlists"], (row) => row.duration),
      zeroIsEmpty: true,
      tiebreakers: [name],
    },
    random: {
      value: (entry) => seededRank(seed, `${entry.bucket}:${entry.row.id}`),
      always: true,
    },
  };
}

// The fields every bucket with rows on screen supports, then only those some
// row actually has data for (no ratings on Jellyfin, no plays on a server that
// doesn't count them, the few fields an offline download carries). With
// nothing listed there is nothing to measure, so the shared fields stand in.
export function availableLibrarySortFields(
  entries: LibrarySortEntry[],
  specs: SortFieldSpecs<LibrarySortEntry, LibrarySortField>,
): LibrarySortField[] {
  const buckets = new Set(entries.map((entry) => entry.bucket));
  if (buckets.size === 0) return SHARED_SORT_FIELDS;
  // On artists alone the artist sort is the alphabetical one.
  const artistsOnly = buckets.size === 1 && buckets.has("artists");
  return availableSortFields(
    entries,
    specs,
    LIBRARY_SORT_FIELDS,
    (field) =>
      !(artistsOnly && field === "artist") &&
      [...buckets].every((bucket) =>
        BUCKET_SORT_FIELDS[bucket].includes(field),
      ),
  );
}
