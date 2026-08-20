// The prefetch cache (issue #163) must be invisible to every "saved for offline"
// surface: no download badge, no Remove-download action, no row in Offline
// downloads, no entry in the offline library or its search corpus, and no
// contribution to the extended-offline sync.
//
// That guarantee is structural — the cache lives in its own store and nothing
// under components/ imports it — so this suite exists to keep it that way. If
// someone later derives an offline UI from the cache, or merges the two stores,
// these break.

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

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
  currentAuthScope: () => "scope",
}));

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import useOffline from "@/stores/offline";
import useTrackCache from "@/stores/trackCache";

const MB = 1024 * 1024;

const cacheEntry = (id: string) => ({
  id,
  path: `file:///cache/${id}`,
  bytes: 5 * MB,
  suffix: "mp3",
  cachedAt: Date.now(),
  lastPlayedAt: 0,
  playCount: 0,
});

const downloadedTrack = (id: string) => ({
  id,
  title: `Title ${id}`,
  artist: "Artist",
  album: "Album",
  duration: 100,
  path: `file:///downloads/${id}`,
  size: 3 * MB,
  downloadedAt: new Date().toISOString(),
});

beforeEach(() => {
  useTrackCache.getState().clearEntries();
  useOffline.setState({ downloadedTracks: {}, downloadedCollections: {} });
});

describe("prefetch cache is invisible to offline UI state", () => {
  test("a cached track is not reported as downloaded", () => {
    useTrackCache.getState().putEntry(cacheEntry("t1"));
    expect(useOffline.getState().isTrackDownloaded("t1")).toBe(false);
    // What useIsTrackAvailableOffline (and every badge) actually reads.
    expect("t1" in useOffline.getState().downloadedTracks).toBe(false);
  });

  test("a cached track does not appear in the downloaded list or counts", () => {
    useTrackCache.getState().putEntry(cacheEntry("t1"));
    useTrackCache.getState().putEntry(cacheEntry("t2"));
    expect(useOffline.getState().getDownloadedTracksList()).toEqual([]);
    expect(useOffline.getState().getDownloadedTracksCount()).toBe(0);
  });

  test("cache bytes are not counted as download storage", () => {
    useTrackCache.getState().putEntry(cacheEntry("t1"));
    useOffline.getState().addDownloadedTrack(downloadedTrack("d1"));
    expect(useOffline.getState().getTotalDownloadSize()).toBe(3 * MB);
    expect(useTrackCache.getState().totalBytes).toBe(5 * MB);
  });

  test("the offline library derivation ignores the cache", () => {
    // What useOfflineTracks / useOfflineArtists / the search corpus all build
    // from: the offline store's map, and nothing else.
    useTrackCache.getState().putEntry(cacheEntry("t1"));
    useOffline.getState().addDownloadedTrack(downloadedTrack("d1"));
    const offlineLibraryIds = Object.values(
      useOffline.getState().downloadedTracks,
    ).map((track) => track.id);
    expect(offlineLibraryIds).toEqual(["d1"]);
  });

  test("the two stores stay disjoint when the same id is in both", () => {
    // Shouldn't happen (downloads win in resolveTrackUrl, and cacheTrack
    // discards on a download landing), but neither store may shadow the other.
    useTrackCache.getState().putEntry(cacheEntry("same"));
    useOffline.getState().addDownloadedTrack(downloadedTrack("same"));
    expect(useOffline.getState().getDownloadedTrack("same")?.path).toBe(
      "file:///downloads/same",
    );
    expect(useTrackCache.getState().getEntry("same")?.path).toBe(
      "file:///cache/same",
    );
  });
});

describe("prefetch cache stays out of the component layer", () => {
  // The invisibility above only holds because no offline UI can see the cache.
  // Guard the import boundary itself rather than trusting future reviewers.
  //
  // Each entry here is a deliberate exception with a reason. Adding one without
  // a reason is the drift this test exists to catch.
  const ALLOWED_IMPORTERS = new Set([
    // Configures the feature.
    "components/settings/sections/DownloadsOfflineSection.tsx",
    // Reports its disk usage.
    "components/settings/StorageOverview.tsx",
    // Reports what the engine is playing off, which is not an ownership badge.
    "components/player/AudioQualityLine.tsx",
    // App shell: scope reset + rehydrate, like every other scoped store.
    "app/(app)/_layout.tsx",
  ]);

  test("no offline UI imports the cache store", () => {
    const grep = spawnSync(
      "grep",
      ["-rl", "stores/trackCache", "components", "hooks", "app"],
      { cwd: join(__dirname, ".."), encoding: "utf8" },
    );
    const offenders = String(grep.stdout ?? "")
      .split("\n")
      .filter(Boolean)
      .filter((file) => !ALLOWED_IMPORTERS.has(file));
    expect(offenders).toEqual([]);
  });

  test("hooks/offline derives from the offline store only", () => {
    const root = join(__dirname, "..", "hooks", "offline");
    for (const file of readdirSync(root)) {
      expect(readFileSync(join(root, file), "utf8")).not.toContain(
        "trackCache",
      );
    }
  });
});
