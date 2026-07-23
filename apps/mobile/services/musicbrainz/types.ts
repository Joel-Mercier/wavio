export type MbArtistCredit = {
  name?: string;
  joinphrase?: string;
  artist: { id: string; name: string };
};

export type MbRecording = {
  id: string;
  title: string;
  length?: number | null;
  /** Only present on search results, 0-100. */
  score?: number;
  "artist-credit"?: MbArtistCredit[];
  /** Releases this recording appears on — present on recording searches. */
  releases?: MbRecordingRelease[];
};

/** A release as embedded in a recording search result (not a full MbRelease). */
export type MbRecordingRelease = {
  id: string;
  title: string;
  date?: string;
  status?: string | null;
  "artist-credit"?: MbArtistCredit[];
  "track-count"?: number;
  "release-group"?: MbReleaseGroup;
  media?: {
    position?: number;
    track?: { number?: string; position?: number }[];
  }[];
};

export type MbRecordingSearchResponse = {
  count: number;
  recordings: MbRecording[];
};

export type MbTrack = {
  id: string;
  title: string;
  number?: string;
  position: number;
  length?: number | null;
  recording?: MbRecording;
  "artist-credit"?: MbArtistCredit[];
  /** Not part of the API response — stamped on when flattening the media list. */
  discNumber?: number;
};

export type MbMedium = {
  position?: number;
  format?: string;
  "track-count"?: number;
  tracks?: MbTrack[];
};

export type MbReleaseGroup = {
  id: string;
  title?: string;
  "primary-type"?: string | null;
  "secondary-types"?: string[];
  "first-release-date"?: string;
};

export type MbRelease = {
  id: string;
  title: string;
  /** Only present on search results, 0-100. Absent on direct lookups. */
  score?: number;
  date?: string;
  country?: string;
  status?: string | null;
  "track-count"?: number;
  "artist-credit"?: MbArtistCredit[];
  "release-group"?: MbReleaseGroup;
  media?: MbMedium[];
};

export type MbReleaseSearchResponse = {
  count: number;
  releases: MbRelease[];
};

/** A local album flattened into the shape the matcher compares against. */
export type LocalAlbumCandidate = {
  albumKey: string;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
  tracks: LocalTrackCandidate[];
};

export type LocalTrackCandidate = {
  trackId: string;
  title: string | null;
  artist: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  durationMs: number | null;
  /** Artwork the indexer extracted from the file, if any. */
  artworkPath: string | null;
};
