jest.mock("@/modules/ssl-trust", () => ({
  resolveServerBase: (url: string) => url,
}));

jest.mock("@/services/jellyfin/streaming", () => ({
  streamUrl: () => "jellyfin-stream",
  hlsStreamUrl: () => "jellyfin-hls",
  downloadUrl: () => "jellyfin-download",
  offlineStreamUrl: (_id: string, format: string) =>
    `jellyfin-offline-${format}`,
  offlineTranscodeSuffix: (format: string) =>
    format === "opus" ? "ogg" : format,
  willDirectPlay: () => true,
  JELLYFIN_DEFAULT_TRANSCODE_CODEC: "aac",
}));

jest.mock("@/services/local/keys", () => ({
  parseLocalPodcastEpisodeId: () => null,
  parseLocalTrackId: () => null,
}));

jest.mock("@/services/network", () => ({
  getEffectiveMaxBitRate: () => null,
  getEffectiveStreamingFormat: (format: string) => format,
}));

jest.mock("@/services/openSubsonic/auth", () => ({
  subsonicAuthQuery: () => "u=u&s=salt&t=tok",
}));

const authState = { serverType: "navidrome" };
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      serverType: authState.serverType,
      url: "http://server",
      username: "u",
    }),
  },
}));

const appState = { downloadFormat: "raw", downloadMaxBitRate: null };
jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({
      maxBitRate: null,
      cellularMaxBitRate: null,
      streamingFormat: "raw",
      downloadFormat: appState.downloadFormat,
      downloadMaxBitRate: appState.downloadMaxBitRate,
    }),
  },
}));

import { Platform } from "react-native";
import {
  cacheEstimatedBytes,
  cacheFetchUrl,
  offlineFileInfo,
} from "@/services/backend/streaming";
import type { Child } from "@/services/openSubsonic/types";

function track(overrides: Partial<Child>): Child {
  return { id: "1", title: "t", isDir: false, ...overrides } as Child;
}

function setPlatform(os: "ios" | "android"): void {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

describe("offlineFileInfo preserves raw audio with bundled ALAC decoding", () => {
  beforeEach(() => {
    authState.serverType = "navidrome";
    appState.downloadFormat = "raw";
    appState.downloadMaxBitRate = null;
    setPlatform("android");
  });

  it("downloads a high-bitrate m4a (ALAC) losslessly on Subsonic", () => {
    const info = offlineFileInfo(
      track({ suffix: "m4a", contentType: "audio/mp4", bitRate: 900 }),
    );
    expect(info.suffix).toBe("m4a");
    expect(info.url).toContain("/rest/download");
  });

  it("downloads a low-bitrate m4a (AAC) untouched", () => {
    const info = offlineFileInfo(
      track({ suffix: "m4a", contentType: "audio/mp4", bitRate: 256 }),
    );
    expect(info.suffix).toBe("m4a");
    expect(info.url).toContain("/rest/download");
  });

  it.each([undefined, 300, 900])(
    "preserves explicit ALAC with bitrate %s",
    (bitRate) => {
      const info = offlineFileInfo(
        track({ suffix: "alac", contentType: "audio/alac", bitRate }),
      );
      expect(info.suffix).toBe("alac");
      expect(info.url).toContain("/rest/download");
    },
  );

  it("caches raw ALAC without a lossy transcode and uses its exact size", () => {
    const source = track({
      suffix: "m4a",
      contentType: "audio/alac",
      bitRate: 900,
      size: 12345678,
    });
    expect(cacheFetchUrl(source)).toContain("/rest/download");
    expect(cacheEstimatedBytes(source)).toBe(source.size);
  });

  it("preserves raw Jellyfin ALAC regardless of bitrate", () => {
    authState.serverType = "jellyfin";
    const info = offlineFileInfo(
      track({ suffix: "m4a", contentType: "audio/alac", bitRate: 300 }),
    );
    expect(info.suffix).toBe("m4a");
    expect(info.url).toBe("jellyfin-download");
  });

  it("keeps ALAC as a raw download on iOS (AVPlayer decodes it natively)", () => {
    setPlatform("ios");
    const info = offlineFileInfo(
      track({ suffix: "m4a", contentType: "audio/alac", bitRate: 900 }),
    );
    expect(info.suffix).toBe("m4a");
    expect(info.url).toContain("/rest/download");
  });

  it("leaves a non-mp4 lossless source (flac) as a raw download", () => {
    const info = offlineFileInfo(
      track({ suffix: "flac", contentType: "audio/flac", bitRate: 1000 }),
    );
    expect(info.suffix).toBe("flac");
    expect(info.url).toContain("/rest/download");
  });

  it("respects an explicit non-raw downloadFormat instead of forcing the fallback", () => {
    appState.downloadFormat = "mp3";
    const info = offlineFileInfo(
      track({ suffix: "m4a", contentType: "audio/mp4", bitRate: 900 }),
    );
    expect(info.suffix).toBe("mp3");
    expect(info.url).toContain("format=mp3");
  });
});
