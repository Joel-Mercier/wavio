// The queue is the only thing the prefetch cache sees, so whatever admission
// control needs has to survive the Child → QueueTrack conversion. It silently
// didn't for `size` (issue #163): cacheEstimatedBytes' exact-size branch type
// checked, read plausibly, and could never run.

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string) => `https://server/stream?id=${id}`,
}));

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => ({ getDownloadedTrack: () => undefined }) },
}));

jest.mock("@/utils/artwork", () => ({
  artworkUrl: () => "https://server/art",
}));

import type { Child } from "@/services/openSubsonic/types";
import { childToTrack } from "@/utils/childToTrack";

const child = (extra: Partial<Child> = {}): Child =>
  ({ id: "t1", title: "Title", ...extra }) as Child;

describe("childToTrack", () => {
  test("carries everything cacheEstimatedBytes reads", () => {
    const track = childToTrack(
      child({ size: 41_943_040, duration: 200, bitRate: 1016, suffix: "flac" }),
    );
    expect(track.size).toBe(41_943_040);
    expect(track.duration).toBe(200);
    expect(track.bitRate).toBe(1016);
    expect(track.suffix).toBe("flac");
  });

  test("leaves size undefined when the server doesn't report one", () => {
    // The estimate falls back to duration × bitrate, which is the behaviour the
    // exact branch is supposed to be the exception to.
    expect(childToTrack(child()).size).toBeUndefined();
  });

  // The player hands TrackInfoModal the queue track, so a field dropped here
  // renders as an empty row there while the same track opened from a list
  // shows it.
  test("carries everything the track info screen reads", () => {
    const info: Partial<Child> = {
      path: "Artist/Album/01 - Title.flac",
      artist: "Artist",
      artists: [{ id: "ar1", name: "Artist" }],
      album: "Album",
      discNumber: 2,
      track: 1,
      year: 1997,
      genre: "Rock",
      genres: [{ name: "Rock" }, { name: "Alternative" }],
      groupings: "Grouping",
      displayComposer: "Composer",
      works: [{ name: "Work" }],
      movements: [{ name: "Movement", number: 1 }],
      moods: ["Calm"],
      bpm: 120,
      comment: "Comment",
      duration: 200,
      suffix: "flac",
      bitRate: 1016,
      samplingRate: 44_100,
      channelCount: 2,
      size: 41_943_040,
      starred: new Date("2026-01-01T00:00:00Z"),
      playCount: 7,
      played: new Date("2026-02-01T00:00:00Z"),
      replayGain: { trackPeak: 0.98, albumPeak: 1 },
    };

    expect(childToTrack(child(info))).toMatchObject(info);
  });

  test("leaves the info fields undefined when the server omits them", () => {
    const track = childToTrack(child());
    for (const field of [
      "path",
      "discNumber",
      "year",
      "genres",
      "groupings",
      "displayComposer",
      "works",
      "movements",
      "moods",
      "bpm",
      "comment",
      "channelCount",
      "playCount",
      "played",
    ] as const) {
      expect(track[field]).toBeUndefined();
    }
  });
});
