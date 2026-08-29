// A download bound for a user-picked folder can't be written there directly:
// `File.downloadFileAsync` resolves its destination through a java.io.File and
// throws on a `content://` URI. So it stages in app storage under its *final*
// name and is moved into the folder afterwards — moved into the directory, not
// onto a constructed child path, because SAF URIs can't be path-joined and only
// the provider knows what it ends up calling the document.

const mockAppState: { downloadLocationUri: string | null } = {
  downloadLocationUri: null,
};

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({ downloadsWifiOnly: false, ...mockAppState }),
  },
}));
const mockAuthState = { scope: "scope" };

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ url: "https://server", username: "n", serverId: "s1" }),
  },
  currentAuthScope: () => mockAuthState.scope,
}));
jest.mock("@/stores/librarySync", () => ({
  useLibrarySyncBase: {
    getState: () => ({ extendedOfflineModeEnabled: true }),
  },
}));
jest.mock("@/services/network", () => ({
  getConnectionType: () => "wifi",
  getIsEffectivelyOnline: () => true,
  subscribeConnectionType: () => () => {},
  subscribeEffectiveOnline: () => () => {},
}));
jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
  isTlsTrustFailure: () => false,
}));
jest.mock("@/utils/log", () => ({ logError: jest.fn() }));
jest.mock("@/services/backend/streaming", () => ({
  offlineFileInfo: (t: { id: string }) => ({
    url: `https://server/stream/${t.id}`,
    suffix: "mp3",
  }),
}));
jest.mock("@/services/offline/collections", () => ({
  trackIdsReferencedByCollections: () => new Set<string>(),
}));

const ROOT = "content://tree/primary%3AMusic";

const mockDownloadDestinations: string[] = [];
const mockMoves: { from: string; to: string; overwrite?: boolean }[] = [];
// What the next download resolves to, when a test needs something other than a
// healthy audio file.
const mockDownloadBody: { size?: number; text?: string; exists?: boolean } = {};
// Set when the destination directory already holds the export name, so `move`
// behaves as expo does: it refuses unless the caller asked for an overwrite.
let mockDestinationOccupied = false;
// Runs after the bytes land and before the move, to stand in for the user
// changing the setting mid-download.
let mockDuringDownload: (() => void) | null = null;
const mockCreatedDirectories: string[] = [];
const mockDeletedDirectories: string[] = [];

jest.mock("expo-file-system", () => {
  const mockJoin = (uris: unknown[]) =>
    uris
      .map((u) =>
        typeof u === "object" && u !== null && "uri" in u
          ? String((u as { uri: string }).uri)
          : String(u),
      )
      .join("/");
  class Directory {
    uri: string;
    constructor(...uris: unknown[]) {
      this.uri = mockJoin(uris);
    }
    exists = true;
    create() {}
    delete() {
      mockDeletedDirectories.push(this.uri);
    }
    // Nothing exists yet, so every lookup falls through to createDirectory.
    list(): unknown[] {
      return [];
    }
    createDirectory(name: string) {
      mockCreatedDirectories.push(name);
      return new Directory(
        `content://tree/primary%3AMusic/document/${encodeURIComponent(name)}`,
      );
    }
  }
  class File {
    uri: string;
    exists = true;
    size = 5_000_000;
    constructor(...uris: unknown[]) {
      this.uri = mockJoin(uris);
    }
    body = "";
    async text() {
      return this.body;
    }
    delete() {}
    async move(
      destination: { uri: string },
      options?: { overwrite?: boolean },
    ) {
      // expo checks the destination for a document of this name itself and
      // throws before SAF is ever asked, so an unqualified move is not a
      // "provider uniquifies it" path — it's a hard failure.
      if (mockDestinationOccupied && !options?.overwrite) {
        throw new Error("Destination already exists");
      }
      mockMoves.push({
        from: this.uri,
        to: destination.uri,
        overwrite: options?.overwrite,
      });
      // The provider names the document and hands back where it landed; `move`
      // rewrites the instance's uri to match.
      const name = this.uri.split("/").pop() ?? "";
      this.uri = `${destination.uri}%2F${encodeURIComponent(name)}`;
    }
    static downloadFileAsync(
      _url: string,
      destination: { uri: string; size: number; body: string; exists: boolean },
    ) {
      mockDownloadDestinations.push(destination.uri);
      if (mockDownloadBody.size !== undefined) {
        destination.size = mockDownloadBody.size;
      }
      if (mockDownloadBody.text !== undefined) {
        destination.body = mockDownloadBody.text;
      }
      if (mockDownloadBody.exists !== undefined) {
        destination.exists = mockDownloadBody.exists;
      }
      mockDuringDownload?.();
      return Promise.resolve(destination);
    }
  }
  return { Directory, File, Paths: { document: "/doc", cache: "/cache" } };
});

import type { Child } from "@/services/openSubsonic/types";
import type useOfflineStore from "@/stores/offline";

const child: Child = {
  id: "t1",
  isDir: false,
  title: "Song",
  artist: "Artist",
  album: "Album",
  displayAlbumArtist: "Artist",
  track: 5,
  suffix: "flac",
  duration: 180,
  size: 5_000_000,
};

function importService() {
  jest.resetModules();
  const { Platform } = require("react-native") as typeof import("react-native");
  Object.defineProperty(Platform, "OS", {
    value: "android",
    configurable: true,
  });
  const { offlineDownloadService } =
    require("@/services/offline/downloadService") as typeof import("@/services/offline/downloadService");
  const useOffline = (
    require("@/stores/offline") as { default: typeof useOfflineStore }
  ).default;
  return { offlineDownloadService, useOffline };
}

beforeEach(() => {
  mockDownloadDestinations.length = 0;
  mockMoves.length = 0;
  mockCreatedDirectories.length = 0;
  mockDeletedDirectories.length = 0;
  mockAppState.downloadLocationUri = null;
  delete mockDownloadBody.size;
  delete mockDownloadBody.text;
  delete mockDownloadBody.exists;
  mockDestinationOccupied = false;
  mockDuringDownload = null;
  mockAuthState.scope = "scope";
});

describe("downloading into a user-picked folder", () => {
  it("stages under the export name, then moves into the album directory", async () => {
    mockAppState.downloadLocationUri = ROOT;
    const { offlineDownloadService, useOffline } = importService();

    await offlineDownloadService.downloadTrack(child);

    // Never downloaded straight to content:// — that call throws on a device.
    expect(mockDownloadDestinations).toEqual([
      "/cache/offline-staging/t1/05 - Song.mp3",
    ]);
    expect(mockCreatedDirectories).toEqual(["scope", "Artist", "Album"]);
    expect(mockMoves).toHaveLength(1);
    // Moved into the directory itself, not a path-joined child URI.
    expect(mockMoves[0]?.to).toBe(
      `${ROOT}/document/${encodeURIComponent("Album")}`,
    );
    // The staging subdirectory is cleaned up behind the move.
    expect(mockDeletedDirectories).toEqual(["/cache/offline-staging/t1"]);

    const stored = useOffline.getState().getDownloadedTrack("t1");
    // The persisted path is where the file actually landed, and the recorded
    // container is the downloaded one — not the server's source suffix.
    expect(stored?.path).toBe(`${mockMoves[0]?.to}%2F05%20-%20Song.mp3`);
    expect(stored?.fileSuffix).toBe("mp3");
    expect(stored?.sourceSuffix).toBe("flac");
  });

  it("overwrites a document of the same name instead of failing on it", async () => {
    // The documented use case is pointing downloads at a music folder you
    // already have, so a collision is routine — and it's the same recording by
    // definition. Without an explicit overwrite expo throws before SAF is even
    // asked, and the track burns every retry it has.
    mockAppState.downloadLocationUri = ROOT;
    mockDestinationOccupied = true;
    const { offlineDownloadService, useOffline } = importService();

    await offlineDownloadService.downloadTrack(child);

    expect(mockMoves[0]?.overwrite).toBe(true);
    expect(useOffline.getState().getDownloadedTrack("t1")).toBeDefined();
  });

  it("keeps the folder it started with when the setting changes mid-download", async () => {
    mockAppState.downloadLocationUri = ROOT;
    // The file is already staged under its export name by the time this lands;
    // resolving the destination again would drop "05 - Song.mp3" into the
    // id-named app-private directory.
    mockDuringDownload = () => {
      mockAppState.downloadLocationUri = null;
    };
    const { offlineDownloadService } = importService();

    await offlineDownloadService.downloadTrack(child);

    expect(mockMoves[0]?.to).toBe(
      `${ROOT}/document/${encodeURIComponent("Album")}`,
    );
  });

  // Same reason the root is read once: the tree is scoped per (server, user), so
  // re-reading the scope at move time would file a track under whichever server
  // happens to be active by then rather than the one that downloaded it.
  it("keeps the scope it started with when the server switches mid-download", async () => {
    mockAppState.downloadLocationUri = ROOT;
    mockDuringDownload = () => {
      mockAuthState.scope = "other";
    };
    const { offlineDownloadService } = importService();

    await offlineDownloadService.downloadTrack(child);

    expect(mockCreatedDirectories).toEqual(["scope", "Artist", "Album"]);
  });

  it("takes the staging directory with it when a download is aborted", async () => {
    mockAppState.downloadLocationUri = ROOT;
    // An error body saved under the track's name: rejected after it lands.
    mockDownloadBody.size = 120;
    mockDownloadBody.text = '{"error":"nope"}';
    const { offlineDownloadService } = importService();

    await expect(offlineDownloadService.downloadTrack(child)).rejects.toThrow();

    expect(mockMoves).toEqual([]);
    // Nothing ever revisits this directory, so leaving it behind leaks one per
    // aborted download (once per attempt here, since the failure is retried).
    expect(new Set(mockDeletedDirectories)).toEqual(
      new Set(["/cache/offline-staging/t1"]),
    );

    // The retried failures leave a backoff timer armed; clearing takes it down.
    await offlineDownloadService.clearAllDownloads();
  });

  // The sibling of the case above, and the one that used to slip through: a
  // download that produced no file at all bailed before the staging cleanup.
  it("takes the staging directory with it when no file lands", async () => {
    mockAppState.downloadLocationUri = ROOT;
    mockDownloadBody.exists = false;
    const { offlineDownloadService } = importService();

    await expect(offlineDownloadService.downloadTrack(child)).rejects.toThrow();

    expect(mockMoves).toEqual([]);
    expect(new Set(mockDeletedDirectories)).toEqual(
      new Set(["/cache/offline-staging/t1"]),
    );

    await offlineDownloadService.clearAllDownloads();
  });

  it("writes straight into app storage when no folder is set", async () => {
    const { offlineDownloadService, useOffline } = importService();

    await offlineDownloadService.downloadTrack(child);

    expect(mockDownloadDestinations).toEqual(["/doc/offline/scope/t1.mp3"]);
    expect(mockMoves).toEqual([]);
    expect(mockCreatedDirectories).toEqual([]);
    expect(useOffline.getState().getDownloadedTrack("t1")?.path).toBe(
      "/doc/offline/scope/t1.mp3",
    );
  });
});
