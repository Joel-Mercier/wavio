// The download location can be a folder the user picked — quite possibly their
// whole music library. `clearAllDownloads` used to finish by recursively
// deleting the scope directory, which is safe only while that directory belongs
// to the app. Pointed at someone's Music folder the same call would destroy
// everything in it, so this pins the one behaviour that must never regress:
// with an external location, deletion is driven entirely by the download
// records, and no directory is ever removed unless the tracks emptied it.

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
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({
      url: "https://server",
      username: "n",
      serverId: "s1",
    }),
  },
  currentAuthScope: () => "scope",
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
jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));
jest.mock("@/utils/log", () => ({ logError: jest.fn() }));
jest.mock("@/services/backend/streaming", () => ({
  offlineFileInfo: (t: { id: string }) => ({ url: `u/${t.id}`, suffix: "mp3" }),
}));
jest.mock("@/services/offline/collections", () => ({
  trackIdsReferencedByCollections: () => new Set<string>(),
}));

const mockDirectoryDeletes: string[] = [];
const mockFileDeletes: string[] = [];
const mockDirectoryListings = new Map<string, unknown[]>();
// Every listing the prune walk asks the provider for — the cost that has to
// stay flat in the number of tracks per album.
const mockDirectoryListCalls: string[] = [];

jest.mock("expo-file-system", () => {
  const mockJoin = (uris: unknown[]) =>
    uris
      .map((u) =>
        typeof u === "object" && u !== null && "uri" in u
          ? String((u as { uri: string }).uri)
          : String(u),
      )
      .join("/");
  return {
    Paths: { document: "/doc", cache: "/cache" },
    Directory: class {
      uri: string;
      constructor(...uris: unknown[]) {
        this.uri = mockJoin(uris);
      }
      exists = true;
      create() {}
      delete() {
        mockDirectoryDeletes.push(this.uri);
      }
      list() {
        mockDirectoryListCalls.push(this.uri);
        return mockDirectoryListings.get(this.uri) ?? [];
      }
      createDirectory(name: string) {
        return new (
          this.constructor as never as {
            new (...u: unknown[]): { uri: string };
          }
        )(`${this.uri}/${name}`);
      }
    },
    File: class {
      uri: string;
      constructor(...uris: unknown[]) {
        this.uri = mockJoin(uris);
      }
      exists = true;
      delete() {
        mockFileDeletes.push(this.uri);
      }
    },
  };
});

import type useOfflineStore from "@/stores/offline";
import type { OfflineTrack } from "@/stores/offline";

const ROOT = "content://tree/primary%3AMusic";

const record = (id: string, path: string, album = "Album"): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  path,
  size: 1_000,
  duration: 100,
  downloadedAt: new Date().toISOString(),
  artist: "Artist",
  album,
});

function importService() {
  jest.resetModules();
  // After resetModules the service resolves a *fresh* react-native, so the
  // platform has to be forced on that copy — the setting is Android-only and the
  // external branch is unreachable under the preset's default platform.
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
  mockDirectoryDeletes.length = 0;
  mockFileDeletes.length = 0;
  mockDirectoryListCalls.length = 0;
  mockDirectoryListings.clear();
  mockAppState.downloadLocationUri = null;
});

describe("clearAllDownloads", () => {
  it("never recursively deletes a download folder the user picked", async () => {
    mockAppState.downloadLocationUri = ROOT;
    const { offlineDownloadService, useOffline } = importService();
    const album = `${ROOT}/document/primary%3AMusic%2FArtist%2FAlbum`;
    useOffline.setState({
      downloadedTracks: {
        a: record("a", `${album}/01 - A.mp3`),
        b: record("b", `${album}/02 - B.mp3`),
      },
    });

    await offlineDownloadService.clearAllDownloads();

    expect(mockFileDeletes).toEqual([
      `${album}/01 - A.mp3`,
      `${album}/02 - B.mp3`,
    ]);
    expect(mockDirectoryDeletes).not.toContain(ROOT);
    // The scope directory belongs to a layout that isn't in use here; touching
    // it would mean the external branch fell through to the internal one.
    expect(mockDirectoryDeletes).not.toContain("/doc/offline/scope");
    expect(useOffline.getState().getDownloadedTracksList()).toEqual([]);
  });

  it("still wipes the app-private scope directory when it owns it", async () => {
    const { offlineDownloadService, useOffline } = importService();
    useOffline.setState({
      downloadedTracks: { a: record("a", "/doc/offline/scope/a.mp3") },
    });

    await offlineDownloadService.clearAllDownloads();

    expect(mockFileDeletes).toEqual(["/doc/offline/scope/a.mp3"]);
    expect(mockDirectoryDeletes).toEqual(["/doc/offline/scope"]);
  });

  it("still deletes the cached artwork it owns, wherever the tracks went", async () => {
    mockAppState.downloadLocationUri = ROOT;
    const { offlineDownloadService, useOffline } = importService();
    const album = `${ROOT}/document/primary%3AMusic%2FArtist%2FAlbum`;
    useOffline.setState({
      downloadedTracks: { a: record("a", `${album}/01 - A.mp3`) },
    });

    await offlineDownloadService.clearAllDownloads();

    // Covers are app-private wherever the tracks live, and the store wipe drops
    // the index that makes them reachable — skipping them here strands the
    // bytes with nothing left able to name them.
    expect(mockDirectoryDeletes).toContain("/doc/offline/scope/artwork");
    expect(mockDirectoryDeletes).not.toContain("/doc/offline/scope");
  });

  it("walks each album once, not once per track in it", async () => {
    mockAppState.downloadLocationUri = ROOT;
    const { offlineDownloadService, useOffline } = importService();
    const album = `${ROOT}/document/primary%3AMusic%2FArtist%2FAlbum`;

    useOffline.setState({
      downloadedTracks: { a: record("a", `${album}/01 - A.mp3`) },
    });
    await offlineDownloadService.clearAllDownloads();
    const oneTrack = mockDirectoryListCalls.length;

    mockDirectoryListCalls.length = 0;
    useOffline.setState({
      downloadedTracks: {
        a: record("a", `${album}/01 - A.mp3`),
        b: record("b", `${album}/02 - B.mp3`),
        c: record("c", `${album}/03 - C.mp3`),
      },
    });
    await offlineDownloadService.clearAllDownloads();

    // Each pass is a ContentResolver walk of a tree that may be the user's whole
    // music library, and it never yields, so paying per track freezes the UI for
    // the length of the library.
    expect(mockDirectoryListCalls.length).toBe(oneTrack);
  });

  it("prunes an album folder its last track emptied, and stops at the root", async () => {
    mockAppState.downloadLocationUri = ROOT;
    const { offlineDownloadService, useOffline } = importService();
    const artist = `${ROOT}/document/${encodeURIComponent("primary:Music/Artist")}`;
    const album = `${ROOT}/document/${encodeURIComponent("primary:Music/Artist/Album")}`;
    // Root still holds the artist folder; artist and album are now empty.
    mockDirectoryListings.set(ROOT, [{ uri: artist }]);
    mockDirectoryListings.set(artist, [{ uri: album }]);
    mockDirectoryListings.set(album, []);

    useOffline.setState({
      downloadedTracks: { a: record("a", `${album}/01 - A.mp3`) },
    });

    await offlineDownloadService.clearAllDownloads();

    expect(mockDirectoryDeletes).not.toContain(ROOT);
  });
});
