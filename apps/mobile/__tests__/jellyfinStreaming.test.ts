jest.mock("@/modules/ssl-trust", () => ({
  resolveServerBase: (url: string) => url,
}));

jest.mock("@/services/jellyfin/deviceId", () => ({
  getDeviceId: () => "device",
}));

jest.mock("@/services/local/keys", () => ({
  parseLocalPodcastEpisodeId: () => null,
  parseLocalTrackId: () => null,
}));

jest.mock("@/services/network", () => ({
  getEffectiveMaxBitRate: (maxBitRate: number | null) => maxBitRate,
}));

const authState = { serverType: "jellyfin" };
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      serverType: authState.serverType,
      url: "http://server",
      username: "u",
      subsonicSalt: "salt",
      subsonicToken: "tok",
      jellyfinAccessToken: "token",
      jellyfinUserId: "user",
    }),
  },
}));

const appState = {
  maxBitRate: null as number | null,
  cellularMaxBitRate: null as number | null,
  streamingFormat: "raw",
};
jest.mock("@/stores/app", () => ({
  useAppBase: { getState: () => appState },
}));

import { trackTranscodeInfo } from "@/services/backend/streaming";
import { willDirectPlay } from "@/services/jellyfin/streaming";
import type { StreamFormat } from "@/stores/app";
import type { QueueTrack } from "@/stores/queue";

const track = (extra: Partial<QueueTrack>): QueueTrack =>
  ({ id: "1", url: "http://x", ...extra }) as QueueTrack;

const aacM4a = track({ suffix: "m4a", contentType: "audio/aac" });
const alacM4a = track({ suffix: "m4a", contentType: "audio/alac" });

describe("willDirectPlay", () => {
  const raw = "raw" as StreamFormat;

  it("direct-plays plain accept-list containers in raw mode", () => {
    expect(willDirectPlay(track({ suffix: "mp3" }), raw)).toBe(true);
    expect(willDirectPlay(track({ suffix: "FLAC" }), raw)).toBe(true);
    expect(willDirectPlay(track({ suffix: "ogg" }), raw)).toBe(true);
  });

  it("matches container|codec pairs on both parts", () => {
    expect(willDirectPlay(aacM4a, raw)).toBe(true);
    expect(willDirectPlay(alacM4a, raw)).toBe(false);
    // Unknown codec can't satisfy a paired entry.
    expect(willDirectPlay(track({ suffix: "m4a" }), raw)).toBe(false);
  });

  it("transcodes unlisted or unknown containers", () => {
    expect(willDirectPlay(track({ suffix: "wma" }), raw)).toBe(false);
    expect(willDirectPlay(track({}), raw)).toBe(false);
  });

  it("uses the narrowed accept-list of a concrete format", () => {
    expect(willDirectPlay(aacM4a, "aac")).toBe(true);
    expect(willDirectPlay(alacM4a, "aac")).toBe(false);
    expect(willDirectPlay(track({ suffix: "flac" }), "aac")).toBe(false);
    expect(willDirectPlay(track({ suffix: "ogg" }), "opus")).toBe(true);
  });
});

describe("trackTranscodeInfo", () => {
  beforeEach(() => {
    authState.serverType = "jellyfin";
    appState.streamingFormat = "raw";
    appState.maxBitRate = null;
  });

  it("predicts the Jellyfin transcode of a raw-mode ALAC m4a (issue #84)", () => {
    const info = trackTranscodeInfo(
      track({ suffix: "m4a", contentType: "audio/alac", bitRate: 640 }),
    );
    expect(info.active).toBe(true);
    expect(info.toLabel).toBe("AAC");
  });

  it("predicts direct play of a raw-mode AAC m4a on Jellyfin", () => {
    expect(trackTranscodeInfo(aacM4a).active).toBe(false);
  });

  it("predicts direct play of an m4a under format=aac on Jellyfin", () => {
    appState.streamingFormat = "aac";
    expect(trackTranscodeInfo(aacM4a).active).toBe(false);
  });

  it("still predicts a bitrate-capped transcode on Jellyfin direct-play containers", () => {
    appState.maxBitRate = 128;
    const info = trackTranscodeInfo(track({ suffix: "flac", bitRate: 1016 }));
    expect(info.active).toBe(true);
    expect(info.toLabel).toBe("AAC · 128 kbps");
  });

  it("keeps Subsonic semantics on Navidrome (raw m4a direct-plays)", () => {
    authState.serverType = "navidrome";
    expect(trackTranscodeInfo(alacM4a).active).toBe(false);
  });

  it("is inactive for the on-device library", () => {
    authState.serverType = "local";
    expect(trackTranscodeInfo(alacM4a).active).toBe(false);
  });
});
