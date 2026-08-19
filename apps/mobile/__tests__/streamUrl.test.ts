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

// Stand-in for the real resolver (covered in network.test.ts): "same" and Wi-Fi
// fall through to the Wi-Fi format, cellular takes the cellular pick.
const netState = { isCellular: false };
jest.mock("@/services/network", () => ({
  getEffectiveMaxBitRate: (
    maxBitRate: number | null,
    cellularMaxBitRate: number | null,
  ) => (netState.isCellular ? (cellularMaxBitRate ?? maxBitRate) : maxBitRate),
  getEffectiveStreamingFormat: (format: string, cellularFormat: string) =>
    netState.isCellular && cellularFormat !== "same" ? cellularFormat : format,
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

const appState = {
  maxBitRate: null as number | null,
  cellularMaxBitRate: null as number | null,
  streamingFormat: "raw",
  cellularStreamingFormat: "same",
};
jest.mock("@/stores/app", () => ({
  useAppBase: { getState: () => appState },
}));

import { streamUrl } from "@/services/backend/streaming";

function resetState() {
  authState.serverType = "navidrome";
  netState.isCellular = false;
  appState.maxBitRate = null;
  appState.cellularMaxBitRate = null;
  appState.streamingFormat = "raw";
  appState.cellularStreamingFormat = "same";
}

describe("streamUrl timeOffset", () => {
  beforeEach(resetState);

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

describe("streamUrl transcoding params", () => {
  beforeEach(resetState);

  it("omits format for a raw stream so a bitrate cap can still downsample", () => {
    appState.cellularMaxBitRate = 128;
    netState.isCellular = true;
    const url = streamUrl("1");
    expect(url).not.toContain("format=");
    expect(url).toContain("&maxBitRate=128");
  });

  it("uses the cellular format on cellular", () => {
    appState.cellularStreamingFormat = "opus";
    netState.isCellular = true;
    expect(streamUrl("1")).toContain("&format=opus");
  });

  it("keeps the Wi-Fi format on Wi-Fi when a cellular format is set", () => {
    appState.streamingFormat = "raw";
    appState.cellularStreamingFormat = "opus";
    expect(streamUrl("1")).not.toContain("format=");
  });

  it("falls through to the Wi-Fi format on cellular when set to same", () => {
    appState.streamingFormat = "mp3";
    netState.isCellular = true;
    expect(streamUrl("1")).toContain("&format=mp3");
  });

  it("overrides the cellular format with the decode-error fallback", () => {
    appState.cellularStreamingFormat = "mp3";
    netState.isCellular = true;
    expect(streamUrl("1", { forceTranscode: true })).toContain("&format=opus");
  });
});
