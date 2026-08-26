// Scope-aware storage mock: unlike the other store tests (which flatten the
// scope to a constant), the key here really carries the active scope, so a
// server switch reads and writes a different bucket.
const mockScope = { value: "serverA_alice" };

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  let suspended = false;
  return {
    __mem: mem,
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    withScopedWritesSuspended: <T>(reset: () => T): T => {
      suspended = true;
      try {
        return reset();
      } finally {
        suspended = false;
      }
    },
    createDynamicScopedStorage: (getScope: () => string) => ({
      setItem: (k: string, v: string) => {
        if (suspended) return;
        mem.set(`${getScope()}:${k}`, v);
      },
      getItem: (k: string) => mem.get(`${getScope()}:${k}`) ?? null,
      removeItem: (k: string) => {
        if (suspended) return;
        mem.delete(`${getScope()}:${k}`);
      },
    }),
  };
});

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => mockScope.value,
  useAuthBase: { getState: () => ({ serverId: "x", username: "y" }) },
}));

import { withScopedWritesSuspended } from "@/config/storage";
import { useAudioMuseBase } from "@/stores/audioMuse";
import useBookmarksBase from "@/stores/bookmarks";
import { useLidarrBase } from "@/stores/lidarr";
import useLrclibPicksBase from "@/stores/lrclibPicks";
import { useSoulSyncBase } from "@/stores/soulsync";
import { useTidarrBase } from "@/stores/tidarr";
import { useTrackCacheBase } from "@/stores/trackCache";

// What app/(app)/_layout.tsx does when the active (server, user) scope changes.
const switchScope = (to: string) => {
  mockScope.value = to;
  withScopedWritesSuspended(() => {
    useLidarrBase.getState().__reset();
    useSoulSyncBase.getState().__reset();
    useTidarrBase.getState().__reset();
    useBookmarksBase.getState().__reset();
    useLrclibPicksBase.getState().__reset();
    useAudioMuseBase.getState().__reset();
    useTrackCacheBase.getState().__reset();
  });
  useLidarrBase.persist.rehydrate();
  useSoulSyncBase.persist.rehydrate();
  useTidarrBase.persist.rehydrate();
  useBookmarksBase.persist.rehydrate();
  useLrclibPicksBase.persist.rehydrate();
  useAudioMuseBase.persist.rehydrate();
  useTrackCacheBase.persist.rehydrate();
};

const lrclibRecord = (id: number) => ({
  id,
  trackName: "Track",
  artistName: "Artist",
});

describe("scoped stores across a server switch", () => {
  it("restores server A's state after a round trip through server B", () => {
    useLidarrBase
      .getState()
      .setConfig({ serverUrl: "http://lidarr.a", apiKey: "KEY_A" });
    useLidarrBase.getState().setConnected(true);
    useSoulSyncBase
      .getState()
      .setConfig({ serverUrl: "http://soulsync.a", apiKey: "SS_KEY_A" });
    useSoulSyncBase.getState().setConnected(true);
    useTidarrBase
      .getState()
      .setConfig({ serverUrl: "http://tidarr.a", apiKey: "TD_KEY_A" });
    useTidarrBase.getState().setConnected(true);
    useBookmarksBase.getState().addBookmark("track-a", 42);
    useLrclibPicksBase.getState().setPick("track-a", lrclibRecord(1));
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://audiomuse.a", apiToken: "TOKEN_A" });
    useAudioMuseBase.getState().setConnected(true);
    useTrackCacheBase.getState().putEntry({
      id: "cached-a",
      path: "file:///cache/a",
      bytes: 1024,
      suffix: "mp3",
      cachedAt: 1,
      lastPlayedAt: 0,
      playCount: 0,
    });

    switchScope("serverB_bob");
    expect(useLidarrBase.getState().serverUrl).toBe("");
    expect(useLidarrBase.getState().isConnected).toBe(false);
    expect(useSoulSyncBase.getState().serverUrl).toBe("");
    expect(useSoulSyncBase.getState().isConnected).toBe(false);
    expect(useTidarrBase.getState().serverUrl).toBe("");
    expect(useTidarrBase.getState().isConnected).toBe(false);
    expect(useBookmarksBase.getState().bookmarks).toEqual({});
    expect(useLrclibPicksBase.getState().picks).toEqual({});
    expect(useAudioMuseBase.getState().serverUrl).toBe("");
    expect(useAudioMuseBase.getState().isConnected).toBe(false);
    // Server B must never see server A's prefetched tracks — the files are
    // stored per scope and the ids mean nothing on another server.
    expect(useTrackCacheBase.getState().entries).toEqual({});
    expect(useTrackCacheBase.getState().totalBytes).toBe(0);

    useBookmarksBase.getState().addBookmark("track-b", 7);
    useLrclibPicksBase.getState().setPick("track-b", lrclibRecord(2));

    switchScope("serverA_alice");
    expect(useLidarrBase.getState().serverUrl).toBe("http://lidarr.a");
    expect(useLidarrBase.getState().apiKey).toBe("KEY_A");
    expect(useLidarrBase.getState().isConnected).toBe(true);
    expect(useSoulSyncBase.getState().serverUrl).toBe("http://soulsync.a");
    expect(useSoulSyncBase.getState().apiKey).toBe("SS_KEY_A");
    expect(useSoulSyncBase.getState().isConnected).toBe(true);
    expect(useTidarrBase.getState().serverUrl).toBe("http://tidarr.a");
    expect(useTidarrBase.getState().apiKey).toBe("TD_KEY_A");
    expect(useTidarrBase.getState().isConnected).toBe(true);
    expect(useAudioMuseBase.getState().serverUrl).toBe("http://audiomuse.a");
    expect(useAudioMuseBase.getState().apiToken).toBe("TOKEN_A");
    expect(useBookmarksBase.getState().bookmarks["track-a"]).toEqual([42]);
    expect(useBookmarksBase.getState().bookmarks["track-b"]).toBeUndefined();
    expect(useLrclibPicksBase.getState().picks["track-a"]?.id).toBe(1);
    expect(useLrclibPicksBase.getState().picks["track-b"]).toBeUndefined();
    expect(useTrackCacheBase.getState().entries["cached-a"]?.bytes).toBe(1024);
    // Derived on rehydrate rather than persisted, so it has to come back too.
    expect(useTrackCacheBase.getState().totalBytes).toBe(1024);

    switchScope("serverB_bob");
    expect(useBookmarksBase.getState().bookmarks["track-b"]).toEqual([7]);
    expect(useLrclibPicksBase.getState().picks["track-b"]?.id).toBe(2);
    expect(useLidarrBase.getState().serverUrl).toBe("");
    expect(useSoulSyncBase.getState().serverUrl).toBe("");
    expect(useTidarrBase.getState().serverUrl).toBe("");
  });
});
