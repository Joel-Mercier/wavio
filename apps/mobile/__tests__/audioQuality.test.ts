import type { QueueTrack } from "@/stores/queue";
import { getTranscodeInfo, localFileTranscodeInfo } from "@/utils/audioQuality";

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
    // The server picks the codec on a raw downsample (Navidrome downsamples to
    // its DefaultDownsamplingFormat, not to FLAC), so only the bitrate is shown.
    expect(info.toLabel).toBe("128 kbps");
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

  it("targets the rawTranscodeFormat codec on a raw bitrate-only cap (Jellyfin)", () => {
    const info = getTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: 128,
      rawTranscodeFormat: "aac",
    });
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("FLAC · 1016 kbps");
    // Jellyfin's raw-mode over-cap transcode lands on AAC, not the source codec.
    expect(info.toLabel).toBe("AAC · 128 kbps");
  });

  it("omits the codec when the server picks it (no rawTranscodeFormat)", () => {
    const info = getTranscodeInfo(track({ suffix: "m4a", bitRate: 256 }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: 128,
    });
    expect(info.toLabel).toBe("128 kbps");
  });

  it("ignores rawTranscodeFormat when a non-raw format drives the transcode", () => {
    const info = getTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), {
      streamingFormat: "opus",
      effectiveMaxBitRate: null,
      rawTranscodeFormat: "aac",
    });
    expect(info.toLabel).toBe("OPUS");
  });

  it("keeps a non-raw format as the target when only the cap forces the transcode", () => {
    const info = getTranscodeInfo(track({ suffix: "mp3", bitRate: 256 }), {
      streamingFormat: "mp3",
      effectiveMaxBitRate: 128,
      rawTranscodeFormat: "aac",
      // Jellyfin direct-plays the container, so nothing about the format forces
      // a transcode — but the cap does, and the URL still asks for AudioCodec=mp3,
      // so mp3 is what comes back.
      formatTranscode: false,
    });
    expect(info.active).toBe(true);
    expect(info.toLabel).toBe("MP3 · 128 kbps");
  });

  it("targets rawTranscodeFormat on a raw container-forced transcode (formatTranscode override)", () => {
    const info = getTranscodeInfo(track({ suffix: "m4a", bitRate: 256 }), {
      streamingFormat: "raw",
      effectiveMaxBitRate: null,
      rawTranscodeFormat: "aac",
      formatTranscode: true,
    });
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("M4A · 256 kbps");
    // The transcode is container-forced, not format-driven, so the target is
    // the backend's default codec — never the literal "raw".
    expect(info.toLabel).toBe("AAC");
  });

  it("stays inactive when formatTranscode is overridden to false despite a format mismatch", () => {
    const info = getTranscodeInfo(track({ suffix: "m4a", bitRate: 256 }), {
      streamingFormat: "aac",
      effectiveMaxBitRate: null,
      formatTranscode: false,
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

describe("localFileTranscodeInfo", () => {
  // Bytes a file of `kbps` would occupy over `seconds`, so the measured bitrate
  // comes back out the other side.
  const bytesFor = (kbps: number, seconds: number) =>
    (kbps * 1000 * seconds) / 8;

  const entry = (suffix: string, kbps: number, seconds = 200) => ({
    suffix,
    bytes: bytesFor(kbps, seconds),
  });

  it("is inactive for a byte-exact copy", () => {
    const info = localFileTranscodeInfo(
      track({ suffix: "flac", bitRate: 1016, duration: 200 }),
      entry("flac", 1016),
    );
    expect(info.active).toBe(false);
  });

  it("reports the transcode a cellular prefetch actually applied", () => {
    // The headline case: predicting from the settings in force now (Wi-Fi, raw)
    // would call this untranscoded, but the file on disk is opus.
    const info = localFileTranscodeInfo(
      track({ suffix: "flac", bitRate: 1016, duration: 200 }),
      entry("opus", 128),
    );
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("FLAC · 1016 kbps");
    expect(info.toLabel).toBe("OPUS · 128 kbps");
  });

  it("catches a downsample that kept the container", () => {
    const info = localFileTranscodeInfo(
      track({ suffix: "mp3", bitRate: 320, duration: 200 }),
      entry("mp3", 128),
    );
    expect(info.active).toBe(true);
    expect(info.toLabel).toBe("MP3 · 128 kbps");
  });

  it("does not call an equivalent container a transcode", () => {
    // The server names the raw file from its own container, so an m4a source can
    // come back as .mp4 without a byte having changed.
    const info = localFileTranscodeInfo(
      track({ suffix: "m4a", bitRate: 256, duration: 200 }),
      entry("mp4", 256),
    );
    expect(info.active).toBe(false);
  });

  it("reports the transcode an offline download was saved with (issue #167)", () => {
    // The reported case: the album was downloaded as mp3@320 while the queue
    // entry still carries the server's FLAC metadata. Playing off disk is not
    // playing the original.
    const info = localFileTranscodeInfo(
      track({ suffix: "flac", bitRate: 1016, duration: 200 }),
      entry("mp3", 320),
    );
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("FLAC · 1016 kbps");
    expect(info.toLabel).toBe("MP3 · 320 kbps");
  });

  it("uses the recorded source when the queue entry describes the file itself", () => {
    // Queued from the Downloads screen: offlineTrackToChild builds the Child
    // from the saved file, so the track claims to *be* mp3. Only the source
    // recorded at download time can tell it came from a FLAC.
    const info = localFileTranscodeInfo(
      track({ suffix: "mp3", duration: 200 }),
      entry("mp3", 320),
      { suffix: "flac", bitRate: 1016 },
    );
    expect(info.active).toBe(true);
    expect(info.fromLabel).toBe("FLAC · 1016 kbps");
    expect(info.toLabel).toBe("MP3 · 320 kbps");
  });

  it("calls a raw download comparable, so it can still be badged ORIGINAL", () => {
    const info = localFileTranscodeInfo(
      track({ suffix: "flac", bitRate: 1016, duration: 200 }),
      entry("flac", 1016),
      { suffix: "flac", bitRate: 1016 },
    );
    expect(info.active).toBe(false);
    expect(info.comparable).toBe(true);
  });

  it("is not comparable when nothing records what the source was", () => {
    // A pre-existing download queued from the Downloads screen: the file agrees
    // with itself and there is no bitrate to measure against. Inactive here
    // means "no evidence", and the caller must not claim ORIGINAL.
    const info = localFileTranscodeInfo(
      track({ suffix: "mp3", duration: 200 }),
      entry("mp3", 320),
    );
    expect(info.active).toBe(false);
    expect(info.comparable).toBe(false);
  });

  it("snaps a measured bitrate onto the rung the encoder aimed at", () => {
    // Tags and embedded cover art push the measured average a few kbps over the
    // 320 the transcode was capped at, by a different amount per track — the
    // label must not read 321 here and 322 on the next one.
    for (const bytes of [entry("mp3", 321).bytes, entry("mp3", 322).bytes]) {
      const info = localFileTranscodeInfo(
        track({ suffix: "flac", bitRate: 1016, duration: 200 }),
        { suffix: "mp3", bytes },
      );
      expect(info.toLabel).toBe("MP3 · 320 kbps");
    }
  });

  it("leaves a genuine VBR average alone", () => {
    // 245 is nowhere near a rung: reporting it as 256 would invent precision.
    const info = localFileTranscodeInfo(
      track({ suffix: "flac", bitRate: 1016, duration: 200 }),
      entry("mp3", 245),
    );
    expect(info.toLabel).toBe("MP3 · 245 kbps");
  });

  it("is inactive with no cache entry, or for radio", () => {
    expect(
      localFileTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }), null)
        .active,
    ).toBe(false);
    expect(
      localFileTranscodeInfo(
        track({ suffix: "flac", bitRate: 1016, duration: 200, isRadio: true }),
        entry("opus", 128),
      ).active,
    ).toBe(false);
  });
});
