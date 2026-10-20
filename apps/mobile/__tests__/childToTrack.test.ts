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
import { childToTrack, trackToChild } from "@/utils/childToTrack";

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
});

describe("trackToChild", () => {
  // Queue rows render through Child, and their "Play next" / "Add to queue"
  // rebuild the track with childToTrack — a field lost on the way round is
  // missing from the inserted copy (#244: replayGain, so it played unnormalized).
  test("round-trips every field childToTrack carries", () => {
    const original = childToTrack(
      child({
        artist: "Artist",
        album: "Album",
        coverArt: "cover",
        genre: "Rock",
        duration: 200,
        contentType: "audio/flac",
        suffix: "flac",
        bitRate: 1016,
        size: 41_943_040,
        samplingRate: 44100,
        starred: new Date("2026-01-01T00:00:00Z"),
        userRating: 4,
        artistId: "ar1",
        artists: [{ id: "ar1", name: "Artist" }],
        albumId: "al1",
        track: 6,
        musicBrainzId: "mbid",
        replayGain: { trackGain: -10.38, albumGain: -11.2, trackPeak: 0.98 },
      }),
    );
    expect(childToTrack(trackToChild(original))).toEqual(original);
  });
});
