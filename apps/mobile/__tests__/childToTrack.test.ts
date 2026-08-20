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
});
