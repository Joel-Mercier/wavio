import { getCapabilities } from "@/services/backend/capabilities";
import type { Child } from "@/services/openSubsonic/types";
import type { OfflineTrack } from "@/stores/offline";
import { availableSortFields, sortItems } from "@/utils/sort";
import {
  OFFLINE_TRACK_SORT_FIELDS,
  OFFLINE_TRACK_SORT_SPECS,
  TRACK_SORT_FIELDS,
  TRACK_SORT_SPECS,
  trackSortEnabled,
} from "@/utils/trackSort";

const track = (id: string, fields: Partial<Child> = {}): Child => ({
  id,
  isDir: false,
  title: id,
  ...fields,
});

const ids = <T extends { id: string }>(items: T[]) =>
  items.map((item) => item.id);

describe("Child sort fields", () => {
  it("addedAt is the list's own order", () => {
    const tracks = [track("a"), track("b"), track("c")];
    expect(ids(sortItems(tracks, "addedAtAsc", TRACK_SORT_SPECS))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(sortItems(tracks, "addedAtDesc", TRACK_SORT_SPECS))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("alphabetical prefers sortName over title", () => {
    const tracks = [
      track("the-b", { title: "The B", sortName: "B, The" }),
      track("a", { title: "A" }),
      track("c", { title: "C" }),
    ];
    expect(ids(sortItems(tracks, "alphabeticalAsc", TRACK_SORT_SPECS))).toEqual(
      ["a", "the-b", "c"],
    );
  });

  it("artist groups by album then disc then track", () => {
    const tracks = [
      track("b-d1t2", { artist: "B", album: "X", discNumber: 1, track: 2 }),
      track("a-d2t1", { artist: "A", album: "Y", discNumber: 2, track: 1 }),
      track("a-d1t1", { artist: "A", album: "Y", discNumber: 1, track: 1 }),
      track("a-other", { artist: "A", album: "A-side", track: 5 }),
    ];
    expect(ids(sortItems(tracks, "artistAsc", TRACK_SORT_SPECS))).toEqual([
      "a-other",
      "a-d1t1",
      "a-d2t1",
      "b-d1t2",
    ]);
    // Descending flips the artists but keeps each album in playing order.
    expect(ids(sortItems(tracks, "artistDesc", TRACK_SORT_SPECS))).toEqual([
      "b-d1t2",
      "a-other",
      "a-d1t1",
      "a-d2t1",
    ]);
  });

  it("albumArtist reads displayAlbumArtist, not artist", () => {
    const tracks = [
      track("va-b", { artist: "Zed", displayAlbumArtist: "B" }),
      track("va-a", { artist: "Amy", displayAlbumArtist: "A" }),
    ];
    expect(ids(sortItems(tracks, "albumArtistAsc", TRACK_SORT_SPECS))).toEqual([
      "va-a",
      "va-b",
    ]);
  });

  it("genre falls back to the genres list and ignores blanks", () => {
    const tracks = [
      track("blank", { genre: "   " }),
      track("rock", { genres: [{ name: "Rock" }] }),
      track("ambient", { genre: "Ambient" }),
    ];
    expect(ids(sortItems(tracks, "genreAsc", TRACK_SORT_SPECS))).toEqual([
      "ambient",
      "rock",
      "blank",
    ]);
  });

  it("year, duration, playCount and rating sort numerically with gaps last", () => {
    const tracks = [
      track("none"),
      track("old", { year: 1979, duration: 300, playCount: 1, userRating: 2 }),
      track("new", { year: 2011, duration: 100, playCount: 9, userRating: 5 }),
      track("unplayed", { playCount: 0, userRating: 0 }),
    ];
    expect(ids(sortItems(tracks, "yearAsc", TRACK_SORT_SPECS))).toEqual([
      "old",
      "new",
      "none",
      "unplayed",
    ]);
    expect(ids(sortItems(tracks, "durationDesc", TRACK_SORT_SPECS))).toEqual([
      "old",
      "new",
      "none",
      "unplayed",
    ]);
    expect(ids(sortItems(tracks, "playCountDesc", TRACK_SORT_SPECS))).toEqual([
      "new",
      "old",
      "none",
      "unplayed",
    ]);
    expect(ids(sortItems(tracks, "ratingAsc", TRACK_SORT_SPECS))).toEqual([
      "old",
      "new",
      "none",
      "unplayed",
    ]);
  });
});

describe("availability per backend", () => {
  const rich = [
    track("a", {
      artist: "A",
      displayAlbumArtist: "A",
      album: "X",
      year: 2020,
      genre: "Rock",
      duration: 100,
      playCount: 3,
      userRating: 4,
    }),
  ];

  it("offers every field on a Subsonic/Navidrome/local server", () => {
    for (const serverType of ["opensubsonic", "navidrome", "local"] as const) {
      expect(
        availableSortFields(
          rich,
          TRACK_SORT_SPECS,
          TRACK_SORT_FIELDS,
          trackSortEnabled(getCapabilities(serverType)),
        ),
      ).toEqual(TRACK_SORT_FIELDS);
    }
  });

  it("drops album artist and rating on Jellyfin", () => {
    expect(
      availableSortFields(
        rich,
        TRACK_SORT_SPECS,
        TRACK_SORT_FIELDS,
        trackSortEnabled(getCapabilities("jellyfin")),
      ),
    ).toEqual([
      "addedAt",
      "alphabetical",
      "artist",
      "album",
      "year",
      "genre",
      "duration",
      "playCount",
    ]);
  });

  it("keeps only the covered fields for sparse entries", () => {
    const sparse = [track("a", { artist: "A", album: "X", duration: 100 })];
    expect(
      availableSortFields(
        sparse,
        TRACK_SORT_SPECS,
        TRACK_SORT_FIELDS,
        trackSortEnabled(getCapabilities("navidrome")),
      ),
    ).toEqual(["addedAt", "alphabetical", "artist", "album", "duration"]);
  });
});

describe("OfflineTrack sort fields", () => {
  const downloaded = (
    id: string,
    fields: Partial<OfflineTrack> = {},
  ): OfflineTrack => ({
    id,
    title: id,
    duration: 100,
    path: `/tmp/${id}.mp3`,
    size: 1000,
    downloadedAt: "2026-07-01T00:00:00.000Z",
    ...fields,
  });

  it("sorts by download date, size and the enriched tag fields", () => {
    const tracks = [
      downloaded("mid", {
        downloadedAt: "2026-07-02T00:00:00.000Z",
        size: 2000,
        year: 2001,
        genre: "Jazz",
        albumArtist: "M",
      }),
      downloaded("old", {
        downloadedAt: "2026-07-01T00:00:00.000Z",
        size: 3000,
        year: 1999,
        genre: "Ambient",
        albumArtist: "A",
      }),
      // Saved before the store kept year/genre/album artist.
      downloaded("legacy", { downloadedAt: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(
      ids(sortItems(tracks, "downloadedAtDesc", OFFLINE_TRACK_SORT_SPECS)),
    ).toEqual(["mid", "old", "legacy"]);
    expect(ids(sortItems(tracks, "sizeAsc", OFFLINE_TRACK_SORT_SPECS))).toEqual(
      ["legacy", "mid", "old"],
    );
    expect(ids(sortItems(tracks, "yearAsc", OFFLINE_TRACK_SORT_SPECS))).toEqual(
      ["old", "mid", "legacy"],
    );
    expect(
      ids(sortItems(tracks, "genreAsc", OFFLINE_TRACK_SORT_SPECS)),
    ).toEqual(["old", "mid", "legacy"]);
    expect(
      ids(sortItems(tracks, "albumArtistAsc", OFFLINE_TRACK_SORT_SPECS)),
    ).toEqual(["old", "mid", "legacy"]);
  });

  it("hides the tag fields for downloads saved before they were kept", () => {
    const legacy = [downloaded("a", { artist: "A", album: "X" })];
    expect(
      availableSortFields(
        legacy,
        OFFLINE_TRACK_SORT_SPECS,
        OFFLINE_TRACK_SORT_FIELDS,
        trackSortEnabled(getCapabilities("navidrome")),
      ),
    ).toEqual([
      "downloadedAt",
      "alphabetical",
      "artist",
      "album",
      "duration",
      "size",
    ]);
  });
});
