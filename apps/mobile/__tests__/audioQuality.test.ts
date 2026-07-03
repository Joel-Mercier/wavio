import type { QueueTrack } from "@/stores/queue";
import { getTranscodeInfo } from "@/utils/audioQuality";

const track = (extra: Partial<QueueTrack>): QueueTrack =>
  ({ id: "1", url: "http://x", ...extra }) as QueueTrack;

describe("getTranscodeInfo", () => {
  it("is inactive when raw with no bitrate cap", () => {
    const info = getTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: null,
    });
    expect(info.active).toBe(false);
    expect(info.toLabel).toBeNull();
  });

  it("is active (bitrate-only) when the cap is below the source bitrate", () => {
    const info = getTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: 128,
    });
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("FLAC · 1016 kbps");
    // Format unchanged on a raw downsample; only the bitrate drops.
    expect(info.toLabel).toBe("FLAC · 128 kbps");
  });

  it("is inactive when the cap is above the source bitrate", () => {
    const info = getTranscodeInfo(track({ suffix: "mp3", bitRate: 128 }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: 320,
    });
    expect(info.active).toBe(false);
  });

  it("is active (format change) when a non-raw format differs from the source", () => {
    const info = getTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), {
      streamingFormat: "opus",
      effectiveMaxBitRate: null,
    });
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("FLAC · 1016 kbps");
    // No cap, so the target bitrate is unknown and omitted.
    expect(info.toLabel).toBe("OPUS");
  });

  it("combines a format change and a bitrate cap in the target label", () => {
    const info = getTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), {
      streamingFormat: "mp3",
      effectiveMaxBitRate: 192,
    });
    expect(info.active).toBe(true);
    expect(info.toLabel).toBe("MP3 · 192 kbps");
  });

  it("is inactive when the requested format already matches the source", () => {
    const info = getTranscodeInfo(track({ suffix: "mp3", bitRate: 192 }), {
      streamingFormat: "mp3",
      effectiveMaxBitRate: null,
    });
    expect(info.active).toBe(false);
  });

  it("does not trigger a bitrate transcode when the source bitrate is unknown", () => {
    const info = getTranscodeInfo(track({ suffix: "flac" }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: 128,
    });
    expect(info.active).toBe(false);
  });

  it("returns inactive for radio and podcast tracks", () => {
    expect(
      getTranscodeInfo(track({ suffix: "mp3", bitRate: 1000, isRadio: true }), {
        streamingFormat: "opus",
        effectiveMaxBitRate: 128,
      }).active,
    ).toBe(false);
    expect(
      getTranscodeInfo(
        track({ suffix: "mp3", bitRate: 1000, source: "podcast" }),
        { streamingFormat: "opus", effectiveMaxBitRate: 128 },
      ).active,
    ).toBe(false);
  });
});
