// Fetching a network share's original bytes to draw 1024 bars is the one place
// the waveform can cost real bandwidth: the share serves the file itself, so
// there is no 64 kbps transcode to ask for. These pin the screen that keeps a
// lossless library from being pulled across the LAN in full and discarded.

const mockDownload = jest.fn();

jest.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  Directory: class {
    exists = true;
    create() {}
    delete() {}
  },
  File: class {
    uri: string;
    exists = true;
    size = 1024 * 1024;
    constructor(..._args: unknown[]) {
      this.uri = "/cache/waveform/copy.flac";
    }
    delete() {}
    async text() {
      return "";
    }
    static async downloadFileAsync(url: string, target: unknown) {
      mockDownload(url);
      return target;
    }
  },
}));

jest.mock("@/services/backend/streaming", () => ({ analysisUrl: () => null }));
jest.mock("@/services/network", () => ({ getConnectionType: () => "wifi" }));
jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({}),
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "https://dav.example.com" }) },
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => ({ getDownloadedTrack: () => null }) },
}));

jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => ({
    kind: "webdav",
    // Mirrors webdav.ts: the address it is handed still carries the `webdav:`
    // prefix, because that is what parseLocalTrackId decodes an id back to.
    playableUrl: (address: string) =>
      `https://dav.example.com${address.replace(/^webdav:/, "")}`,
  }),
}));

const mockQueryTrackById = jest.fn();
jest.mock("@/services/local/repository", () => ({
  queryTrackById: (id: string) => mockQueryTrackById(id),
}));

import { localTrackId } from "@/services/local/keys";
import { resolveAnalysisSource } from "@/services/waveform/source";
import type { QueueTrack } from "@/stores/queue";

// 4 minutes at 40 KB/s of audio ≈ a 9.4 MB budget, comfortably over the 8 MB
// floor so the numbers below are the per-second rule and not the floor.
const DURATION = 240;
const OVER_BUDGET = 30 * 1024 * 1024;
const UNDER_BUDGET = 5 * 1024 * 1024;

const track = (over: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id: localTrackId("webdav:/Music/a.flac"),
    url: "",
    duration: DURATION,
    ...over,
  }) as QueueTrack;

beforeEach(() => {
  mockDownload.mockClear();
  mockQueryTrackById.mockReset();
  mockQueryTrackById.mockResolvedValue(null);
});

describe("resolveAnalysisSource — network share byte budget", () => {
  it("refuses an oversized track from the queue item's own size", async () => {
    expect(await resolveAnalysisSource(track({ size: OVER_BUDGET }))).toBe(
      "unsupported",
    );
    expect(mockDownload).not.toHaveBeenCalled();
    // Already known — no reason to ask the index.
    expect(mockQueryTrackById).not.toHaveBeenCalled();
  });

  it("falls back to the index when the queue item carries no size", async () => {
    mockQueryTrackById.mockResolvedValue({ size: OVER_BUDGET });
    expect(await resolveAnalysisSource(track())).toBe("unsupported");
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("fetches a track that fits", async () => {
    const resolved = await resolveAnalysisSource(track({ size: UNDER_BUDGET }));
    expect(resolved).toMatchObject({ temporary: true });
    expect(mockDownload).toHaveBeenCalledWith(
      "https://dav.example.com/Music/a.flac",
    );
  });

  it("still fetches when neither the queue nor the index knows the size", async () => {
    // The index is an optimisation here; downloadAnalysisCopy's post-download
    // check remains the backstop, so an unknown size must not refuse a waveform.
    await resolveAnalysisSource(track());
    expect(mockDownload).toHaveBeenCalled();
  });

  it("still fetches when the index read throws", async () => {
    mockQueryTrackById.mockRejectedValue(new Error("db closed"));
    await resolveAnalysisSource(track());
    expect(mockDownload).toHaveBeenCalled();
  });
});
