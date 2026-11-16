const mockMem = new Map<string, string>();
jest.mock("@/config/storage", () => ({
  getNoBackupStorage: () => ({
    set: (k: string, v: string) => mockMem.set(k, v),
    getString: (k: string) => mockMem.get(k),
    remove: (k: string) => mockMem.delete(k),
    getAllKeys: () => [...mockMem.keys()],
  }),
}));

let mockScope = "server_a_joel";
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => mockScope }));

let mockNavidromeNative = false;
jest.mock("@/services/backend/dispatch", () => ({
  isNavidromeNative: () => mockNavidromeNative,
}));

const mockSmartPlaylists = jest.fn();
jest.mock("@/services/navidrome/playlists", () => ({
  getVisibleSmartPlaylists: () => mockSmartPlaylists(),
}));

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));
jest.mock("@/services/notFound", () => ({
  isNotFoundError: (error: unknown) =>
    (error as { code?: number } | null)?.code === 70,
}));

import type {
  Child,
  Playlist,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import {
  __resetPlaylistArtistIndexRefresh,
  beginPlaylistRead,
  cachedArtistPlaylists,
  indexedArtistPlaylists,
  loadedArtistPlaylists,
  type PlaylistSource,
  refreshPlaylistArtistIndex,
} from "@/services/playlistArtistIndex";
import {
  MAX_FETCH_PER_REFRESH,
  MAX_REVERIFY_PER_REFRESH,
  REVERIFY_AFTER_MS,
  SMART_REFRESH_MS,
} from "@/services/playlistArtistIndex/plan";
import {
  __resetPlaylistArtistIndexMemory,
  forgetScopes,
} from "@/services/playlistArtistIndex/storage";

const T0 = 1_700_000_000_000;

type ServerPlaylist = Playlist & { tracks: Child[] };

const song = (id: string, artistId: string, featured: string[] = []): Child =>
  ({
    id,
    title: id,
    isDir: false,
    artistId,
    artists: [
      { id: artistId, name: artistId },
      ...featured.map((f) => ({ id: f, name: f })),
    ],
  }) as Child;

let server: Map<string, ServerPlaylist>;
let loads: string[];
let listingFails = false;

const put = (
  id: string,
  tracks: Child[],
  extra: Partial<Playlist> = {},
): void => {
  server.set(id, {
    id,
    name: extra.name ?? id,
    songCount: tracks.length,
    duration: tracks.length * 200,
    created: new Date(0),
    changed: new Date(1_000 + server.size),
    tracks,
    ...extra,
  });
};

const edit = (id: string, tracks: Child[], changedAt?: number) => {
  const current = server.get(id);
  if (!current) throw new Error(id);
  server.set(id, {
    ...current,
    tracks,
    songCount: tracks.length,
    duration: tracks.length * 200,
    changed: new Date(changedAt ?? Date.now()),
  });
};

const source: PlaylistSource = {
  listPlaylists: async () => {
    if (listingFails) throw new Error("unreachable");
    return {
      playlists: {
        playlist: [...server.values()].map(({ tracks: _t, ...p }) => p),
      },
    };
  },
  loadPlaylist: async (id) => {
    loads.push(id);
    const p = server.get(id);
    if (!p) throw Object.assign(new Error("gone"), { code: 70 });
    const { tracks, ...meta } = p;
    return { playlist: { ...meta, entry: tracks } as PlaylistWithSongs };
  },
};

const ids = (playlists: Playlist[]) => playlists.map((p) => p.id);
const readyIndex = () => cachedArtistPlaylists(mockScope, "");

async function refresh() {
  __resetPlaylistArtistIndexRefresh();
  await refreshPlaylistArtistIndex(mockScope, source);
}

beforeEach(() => {
  mockMem.clear();
  __resetPlaylistArtistIndexMemory();
  __resetPlaylistArtistIndexRefresh();
  server = new Map();
  loads = [];
  listingFails = false;
  mockNavidromeNative = false;
  mockScope = "server_a_joel";
  mockSmartPlaylists.mockReset();
  jest.useRealTimers();
});

describe("playlist artist index", () => {
  it("finds every playlist holding the artist, featured credits included, most tracks first", async () => {
    put("road", [song("1", "radiohead")]);
    put("mix", [song("2", "radiohead"), song("3", "radiohead")]);
    put("guests", [song("4", "massive", ["radiohead"])]);
    put("other", [song("5", "bjork")]);

    const found = await indexedArtistPlaylists("radiohead", source);

    expect(ids(found)).toEqual(["mix", "guests", "road"]);
  });

  it("only refetches playlists whose listing changed", async () => {
    put("a", [song("1", "radiohead")]);
    put("b", [song("2", "bjork")]);
    await refresh();
    loads = [];

    edit("b", [song("2", "bjork"), song("3", "radiohead")]);
    await refresh();

    expect(loads).toEqual(["b"]);
    expect(ids(cachedArtistPlaylists(mockScope, "radiohead"))).toEqual([
      "a",
      "b",
    ]);
  });

  it("drops a track removed on the server", async () => {
    put("a", [song("1", "radiohead"), song("2", "bjork")]);
    await refresh();

    edit("a", [song("2", "bjork")]);
    await refresh();

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
  });

  it("forgets a playlist that is no longer listed (deleted or made private)", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();

    server.delete("a");
    await refresh();

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
    expect([...mockMem.keys()].some((k) => k.includes("entry:a"))).toBe(false);
  });

  it("drops a playlist deleted between the listing and its fetch", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();
    edit("a", [song("1", "radiohead"), song("2", "radiohead")]);
    const load = source.loadPlaylist;
    const racing: PlaylistSource = {
      ...source,
      loadPlaylist: async (id) => {
        server.delete(id);
        return load(id);
      },
    };

    __resetPlaylistArtistIndexRefresh();
    await refreshPlaylistArtistIndex(mockScope, racing);

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
  });

  it("re-verifies the oldest unchanged entries after a week, a few at a time", async () => {
    jest.useFakeTimers({ now: T0 });
    for (let i = 0; i < MAX_REVERIFY_PER_REFRESH + 2; i++) {
      put(`p${i}`, [song(`${i}`, "radiohead")], { changed: new Date(1) });
    }
    await refresh();
    loads = [];

    jest.setSystemTime(T0 + REVERIFY_AFTER_MS + 1);
    await refresh();

    expect(loads).toHaveLength(MAX_REVERIFY_PER_REFRESH);
  });

  it("catches a re-tag the listing can't see on re-verify", async () => {
    jest.useFakeTimers({ now: T0 });
    put("a", [song("1", "radiohead")], { changed: new Date(1) });
    await refresh();

    server.set("a", {
      ...(server.get("a") as ServerPlaylist),
      tracks: [song("1", "thom")],
    });
    jest.setSystemTime(T0 + REVERIFY_AFTER_MS + 1);
    await refresh();

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
    expect(ids(cachedArtistPlaylists(mockScope, "thom"))).toEqual(["a"]);
  });

  describe("smart playlists", () => {
    beforeEach(() => {
      mockNavidromeNative = true;
      mockSmartPlaylists.mockResolvedValue([
        {
          id: "smart",
          name: "smart",
          rules: { all: [{ is: { loved: true } }] },
        },
      ]);
    });

    it("refreshes once a day even though every read moves their signature", async () => {
      jest.useFakeTimers({ now: T0 });
      put("smart", [song("1", "radiohead")]);
      await refresh();
      loads = [];

      edit("smart", [song("1", "radiohead"), song("2", "bjork")], 5);
      jest.setSystemTime(T0 + SMART_REFRESH_MS - 1);
      await refresh();
      expect(loads).toEqual([]);

      jest.setSystemTime(T0 + SMART_REFRESH_MS);
      await refresh();
      expect(loads).toEqual(["smart"]);
      expect(ids(cachedArtistPlaylists(mockScope, "bjork"))).toEqual(["smart"]);
    });

    it("refreshes at once when the rules are edited", async () => {
      put("smart", [song("1", "radiohead")]);
      await refresh();
      loads = [];

      mockSmartPlaylists.mockResolvedValue([
        {
          id: "smart",
          name: "smart",
          rules: { all: [{ is: { genre: "Rock" } }] },
        },
      ]);
      await refresh();

      expect(loads).toEqual(["smart"]);
    });

    it("recognises OpenSubsonic smart playlists by validUntil", async () => {
      mockNavidromeNative = false;
      jest.useFakeTimers({ now: T0 });
      put("smart", [song("1", "radiohead")], { validUntil: "2030-01-01" });
      await refresh();
      loads = [];

      edit("smart", [song("1", "radiohead")], 99);
      await refresh();

      expect(loads).toEqual([]);
    });
  });

  it("updates an indexed playlist from a full read elsewhere", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();

    server.set("a", {
      ...(server.get("a") as ServerPlaylist),
      tracks: [song("2", "bjork")],
    });
    const noteRead = beginPlaylistRead();
    const { playlist } = await source.loadPlaylist("a");
    noteRead(playlist);
    loads = [];
    await refresh();

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
    expect(loads).toEqual([]);
  });

  it("keeps the listing's signature when the detail reports another", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();

    const noteRead = beginPlaylistRead();
    const { playlist } = await source.loadPlaylist("a");
    noteRead(playlist && { ...playlist, duration: 9_999 });
    loads = [];
    await refresh();

    expect(loads).toEqual([]);
  });

  it("never adds a playlist from a read the listing hasn't shown", async () => {
    put("a", [song("1", "radiohead")]);
    const noteRead = beginPlaylistRead();
    const { playlist } = await source.loadPlaylist("a");

    noteRead(playlist);

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
  });

  it("ignores a read that finished after a server switch", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();
    edit("a", [song("2", "bjork")]);
    const noteRead = beginPlaylistRead();
    const { playlist } = await source.loadPlaylist("a");

    const before = mockScope;
    mockScope = "server_b_joel";
    noteRead(playlist);
    mockScope = before;

    expect(ids(cachedArtistPlaylists(mockScope, "radiohead"))).toEqual(["a"]);
  });

  it("keeps each server's index apart and forgets a removed server's", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();
    mockScope = "server_b_joel";
    server = new Map();
    put("b", [song("1", "radiohead")]);
    await refresh();

    forgetScopes((s) => s.startsWith("server_a_"));

    expect(ids(cachedArtistPlaylists("server_b_joel", "radiohead"))).toEqual([
      "b",
    ]);
    expect(cachedArtistPlaylists("server_a_joel", "radiohead")).toEqual([]);
    expect(
      [...mockMem.keys()].every((k) => k.startsWith("server_b_joel:")),
    ).toBe(true);
  });

  it("serves the stored index when the server can't be reached", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();
    __resetPlaylistArtistIndexMemory();
    __resetPlaylistArtistIndexRefresh();
    listingFails = true;

    const found = await indexedArtistPlaylists("radiohead", source);

    expect(ids(found)).toEqual(["a"]);
  });

  it("doesn't re-list within the cooldown", async () => {
    put("a", [song("1", "radiohead")]);
    const list = jest.spyOn(source, "listPlaylists");
    await refreshPlaylistArtistIndex(mockScope, source);
    await refreshPlaylistArtistIndex(mockScope, source);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it("fetches a capped batch per refresh and doesn't wait out the cooldown for the rest", async () => {
    for (let i = 0; i < MAX_FETCH_PER_REFRESH + 3; i++) {
      put(`p${i}`, [song(`${i}`, "radiohead")]);
    }
    await refreshPlaylistArtistIndex(mockScope, source);
    expect(loads).toHaveLength(MAX_FETCH_PER_REFRESH);

    loads = [];
    await refreshPlaylistArtistIndex(mockScope, source);
    expect(loads).toHaveLength(3);
  });

  it("fetches outdated entries before new ones", async () => {
    put("old", [song("1", "radiohead")]);
    await refresh();
    edit("old", [song("1", "radiohead"), song("2", "radiohead")]);
    for (let i = 0; i < MAX_FETCH_PER_REFRESH; i++) {
      put(`new${i}`, [song(`n${i}`, "bjork")]);
    }
    loads = [];

    await refresh();

    expect(loads[0]).toBe("old");
    expect(loads).toHaveLength(MAX_FETCH_PER_REFRESH);
  });

  it("backs off a playlist whose fetch keeps failing", async () => {
    jest.useFakeTimers({ now: T0 });
    put("big", [song("1", "radiohead")]);
    const failing: PlaylistSource = {
      ...source,
      loadPlaylist: async (id) => {
        loads.push(id);
        throw new Error("timeout");
      },
    };
    __resetPlaylistArtistIndexRefresh();
    await refreshPlaylistArtistIndex(mockScope, failing);
    expect(loads).toEqual(["big"]);

    jest.setSystemTime(T0 + 60_000);
    await refreshPlaylistArtistIndex(mockScope, failing);
    expect(loads).toEqual(["big"]);

    jest.setSystemTime(T0 + 10 * 60_000);
    await refreshPlaylistArtistIndex(mockScope, source);
    expect(loads).toEqual(["big", "big"]);
    expect(ids(cachedArtistPlaylists(mockScope, "radiohead"))).toEqual(["big"]);
  });

  it("drops a refresh that was running when the scope was forgotten", async () => {
    put("a", [song("1", "radiohead")]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: PlaylistSource = {
      ...source,
      loadPlaylist: async (id) => {
        await gate;
        return source.loadPlaylist(id);
      },
    };

    const running = refreshPlaylistArtistIndex(mockScope, slow);
    await new Promise((resolve) => setImmediate(resolve));
    forgetScopes((s) => s === mockScope);
    release();
    await running;

    expect(cachedArtistPlaylists(mockScope, "radiohead")).toEqual([]);
    expect([...mockMem.keys()].some((k) => k.includes("entry:"))).toBe(false);

    await refreshPlaylistArtistIndex(mockScope, source);
    expect(ids(cachedArtistPlaylists(mockScope, "radiohead"))).toEqual(["a"]);
  });

  it("ignores a read that began before the scope was forgotten", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();
    const noteRead = beginPlaylistRead();
    const { playlist } = await source.loadPlaylist("a");

    forgetScopes((s) => s === mockScope);
    await refreshPlaylistArtistIndex(mockScope, source);
    edit("a", [song("1", "thom")]);
    noteRead(playlist && { ...playlist, entry: [song("1", "stale")] });

    expect(cachedArtistPlaylists(mockScope, "stale")).toEqual([]);
  });

  it("answers render paths only once the index is loaded", async () => {
    put("a", [song("1", "radiohead")]);
    await refresh();
    __resetPlaylistArtistIndexMemory();

    expect(loadedArtistPlaylists(mockScope, "radiohead")).toBeUndefined();

    readyIndex();
    expect(ids(loadedArtistPlaylists(mockScope, "radiohead") ?? [])).toEqual([
      "a",
    ]);
  });

  it("sorts playlists the server sent without a name", async () => {
    put("a", [song("1", "radiohead")], {
      name: undefined as unknown as string,
    });
    put("b", [song("2", "radiohead")]);
    await refresh();

    expect(ids(cachedArtistPlaylists(mockScope, "radiohead"))).toHaveLength(2);
  });
});
