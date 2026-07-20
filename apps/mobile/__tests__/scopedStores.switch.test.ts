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
import useBookmarksBase from "@/stores/bookmarks";
import { useLidarrBase } from "@/stores/lidarr";

// What app/(app)/_layout.tsx does when the active (server, user) scope changes.
const switchScope = (to: string) => {
  mockScope.value = to;
  withScopedWritesSuspended(() => {
    useLidarrBase.getState().__reset();
    useBookmarksBase.getState().__reset();
  });
  useLidarrBase.persist.rehydrate();
  useBookmarksBase.persist.rehydrate();
};

describe("scoped stores across a server switch", () => {
  it("restores server A's state after a round trip through server B", () => {
    useLidarrBase
      .getState()
      .setConfig({ serverUrl: "http://lidarr.a", apiKey: "KEY_A" });
    useLidarrBase.getState().setConnected(true);
    useBookmarksBase.getState().addBookmark("track-a", 42);

    switchScope("serverB_bob");
    expect(useLidarrBase.getState().serverUrl).toBe("");
    expect(useLidarrBase.getState().isConnected).toBe(false);
    expect(useBookmarksBase.getState().bookmarks).toEqual({});

    useBookmarksBase.getState().addBookmark("track-b", 7);

    switchScope("serverA_alice");
    expect(useLidarrBase.getState().serverUrl).toBe("http://lidarr.a");
    expect(useLidarrBase.getState().apiKey).toBe("KEY_A");
    expect(useLidarrBase.getState().isConnected).toBe(true);
    expect(useBookmarksBase.getState().bookmarks["track-a"]).toEqual([42]);
    expect(useBookmarksBase.getState().bookmarks["track-b"]).toBeUndefined();

    switchScope("serverB_bob");
    expect(useBookmarksBase.getState().bookmarks["track-b"]).toEqual([7]);
    expect(useLidarrBase.getState().serverUrl).toBe("");
  });
});
