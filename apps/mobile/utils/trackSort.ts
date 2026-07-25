import type { BackendCapabilities } from "@/services/backend/capabilities";
import type { Child } from "@/services/openSubsonic/types";
import type { OfflineTrack } from "@/stores/offline";
import type { SortFieldSpecs, SortType } from "@/utils/sort";

// Field specs (see utils/sort.ts) for the two track shapes the app sorts:
// Subsonic-shaped `Child`s coming from any backend, and `OfflineTrack`s from the
// downloads store. Every sortable field lives here once so the playlist,
// favorites and downloads screens can't drift apart again.

export type TrackSortField =
  | "addedAt"
  | "alphabetical"
  | "artist"
  | "albumArtist"
  | "album"
  | "year"
  | "genre"
  | "duration"
  | "playCount"
  | "rating";

export type TrackSortType = SortType<TrackSortField>;

// Sheet row order, so every screen offers the fields in the same sequence.
export const TRACK_SORT_FIELDS: TrackSortField[] = [
  "addedAt",
  "alphabetical",
  "artist",
  "albumArtist",
  "album",
  "year",
  "genre",
  "duration",
  "playCount",
  "rating",
];

const title = (track: Child) => track.sortName || track.title;
const genreOf = (track: Child) =>
  track.genre?.trim() || track.genres?.[0]?.name;

export const TRACK_SORT_SPECS: SortFieldSpecs<Child, TrackSortField> = {
  // The list's own order: server order for playlists (with the manual reorder
  // overlay already applied by utils/playlistOrder), starred order for favorites.
  addedAt: { value: () => undefined, order: true },
  alphabetical: { value: title, always: true },
  artist: {
    value: (track) => track.artist,
    tiebreakers: [
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      title,
    ],
  },
  albumArtist: {
    value: (track) => track.displayAlbumArtist,
    tiebreakers: [
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      title,
    ],
  },
  album: {
    value: (track) => track.album,
    tiebreakers: [(track) => track.discNumber, (track) => track.track, title],
  },
  year: {
    value: (track) => track.year,
    tiebreakers: [
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      title,
    ],
  },
  genre: {
    value: genreOf,
    tiebreakers: [
      (track) => track.artist,
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      title,
    ],
  },
  duration: { value: (track) => track.duration, tiebreakers: [title] },
  playCount: {
    value: (track) => track.playCount,
    zeroIsEmpty: true,
    tiebreakers: [title],
  },
  rating: {
    value: (track) => track.userRating,
    zeroIsEmpty: true,
    tiebreakers: [title],
  },
};

export type OfflineTrackSortField =
  | "downloadedAt"
  | "alphabetical"
  | "artist"
  | "albumArtist"
  | "album"
  | "year"
  | "genre"
  | "duration"
  | "size";

export type OfflineTrackSortType = SortType<OfflineTrackSortField>;

export const OFFLINE_TRACK_SORT_FIELDS: OfflineTrackSortField[] = [
  "downloadedAt",
  "alphabetical",
  "artist",
  "albumArtist",
  "album",
  "year",
  "genre",
  "duration",
  "size",
];

const offlineTitle = (track: OfflineTrack) => track.sortName || track.title;

export const OFFLINE_TRACK_SORT_SPECS: SortFieldSpecs<
  OfflineTrack,
  OfflineTrackSortField
> = {
  downloadedAt: {
    value: (track) => Date.parse(track.downloadedAt) || undefined,
    always: true,
    tiebreakers: [offlineTitle],
  },
  alphabetical: { value: offlineTitle, always: true },
  artist: {
    value: (track) => track.artist,
    tiebreakers: [
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      offlineTitle,
    ],
  },
  albumArtist: {
    value: (track) => track.albumArtist,
    tiebreakers: [
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      offlineTitle,
    ],
  },
  album: {
    value: (track) => track.album,
    tiebreakers: [
      (track) => track.discNumber,
      (track) => track.track,
      offlineTitle,
    ],
  },
  year: {
    value: (track) => track.year,
    tiebreakers: [
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      offlineTitle,
    ],
  },
  genre: {
    value: (track) => track.genre?.trim(),
    tiebreakers: [
      (track) => track.artist,
      (track) => track.album,
      (track) => track.discNumber,
      (track) => track.track,
      offlineTitle,
    ],
  },
  duration: { value: (track) => track.duration, tiebreakers: [offlineTitle] },
  size: { value: (track) => track.size, tiebreakers: [offlineTitle] },
};

// Fields no amount of data coverage can make meaningful on the active backend:
// Jellyfin's mapper fills a song's `artist` from AlbumArtist (so an album-artist
// sort would duplicate the artist one) and exposes no numeric rating.
export function trackSortEnabled(
  capabilities: Pick<BackendCapabilities, "songAlbumArtist" | "setRating">,
): (field: TrackSortField | OfflineTrackSortField) => boolean {
  return (field) => {
    if (field === "albumArtist") return capabilities.songAlbumArtist;
    if (field === "rating") return capabilities.setRating;
    return true;
  };
}
