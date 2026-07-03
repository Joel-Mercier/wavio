jest.mock("@/modules/ssl-trust", () => ({
  resolveServerBase: (url: string) => url,
}));

jest.mock("@/services/jellyfin/streaming", () => ({
  streamUrl: () => "jellyfin-stream",
  hlsStreamUrl: () => "jellyfin-hls",
  downloadUrl: () => "jellyfin-download",
}));

jest.mock("@/services/local/keys", () => ({
  parseLocalPodcastEpisodeId: () => null,
  parseLocalTrackId: () => null,
}));

jest.mock("@/services/network", () => ({
  getEffectiveMaxBitRate: () => null,
}));

const authState = { serverType: "navidrome" };
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      serverType: authState.serverType,
      url: "http://server",
      username: "u",
      subsonicSalt: "salt",
      subsonicToken: "tok",
    }),
  },
}));

jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({
      maxBitRate: null,
      cellularMaxBitRate: null,
      streamingFormat: "raw",
    }),
  },
}));

import { streamUrl } from "@/services/backend/streaming";

describe("streamUrl timeOffset", () => {
  beforeEach(() => {
    authState.serverType = "navidrome";
  });

  it("appends timeOffset (floored) when positive", () => {
    expect(streamUrl("1", { timeOffset: 42.9 })).toContain("&timeOffset=42");
  });

  it("omits timeOffset when zero, negative or absent", () => {
    expect(streamUrl("1")).not.toContain("timeOffset");
    expect(streamUrl("1", { timeOffset: 0 })).not.toContain("timeOffset");
    expect(streamUrl("1", { timeOffset: -5 })).not.toContain("timeOffset");
  });

  it("does not append timeOffset for Jellyfin", () => {
    authState.serverType = "jellyfin";
    expect(streamUrl("1", { timeOffset: 42 })).not.toContain("timeOffset");
  });
});
