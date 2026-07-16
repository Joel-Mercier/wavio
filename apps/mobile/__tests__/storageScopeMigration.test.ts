const mockMem = new Map<string, string>();
jest.mock("@/config/storage", () => ({
  storage: {
    set: (k: string, v: string) => mockMem.set(k, v),
    getString: (k: string) => mockMem.get(k),
    remove: (k: string) => mockMem.delete(k),
    getAllKeys: () => [...mockMem.keys()],
  },
}));

const mockDirs = new Set<string>();
const mockFiles = new Set<string>();
const joinSegments = (segments: (string | { path: string })[]) =>
  segments.map((s) => (typeof s === "string" ? s : s.path)).join("/");
jest.mock("expo-file-system", () => ({
  Paths: { document: "/doc" },
  Directory: class {
    path: string;
    constructor(...segments: (string | { path: string })[]) {
      this.path = joinSegments(segments);
    }
    get exists() {
      return mockDirs.has(this.path);
    }
    moveSync(dest: { path: string }) {
      mockDirs.delete(this.path);
      mockDirs.add(dest.path);
    }
  },
  File: class {
    path: string;
    constructor(...segments: (string | { path: string })[]) {
      this.path = joinSegments(segments);
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    moveSync(dest: { path: string }) {
      mockFiles.delete(this.path);
      mockFiles.add(dest.path);
    }
  },
}));

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

const mockAuth = {
  state: { isAuthenticated: false, serverId: "", url: "" },
  logout: jest.fn(),
};
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ ...mockAuth.state, logout: mockAuth.logout }),
    setState: (patch: Record<string, unknown>) =>
      Object.assign(mockAuth.state, patch),
  },
}));

const mockSetStates = {
  musicFolders: jest.fn(),
  podcasts: jest.fn(),
  radioStations: jest.fn(),
};
jest.mock("@/stores/musicFolders", () => ({
  useMusicFoldersBase: {
    setState: (s: unknown) => mockSetStates.musicFolders(s),
  },
}));
jest.mock("@/stores/podcasts", () => ({
  usePodcastsBase: { setState: (s: unknown) => mockSetStates.podcasts(s) },
}));
jest.mock("@/stores/radioStations", () => ({
  useRadioStationsBase: {
    setState: (s: unknown) => mockSetStates.radioStations(s),
  },
}));

import {
  buildScopeRemap,
  hasRunStorageScopeMigration,
  legacyAuthScope,
  remapOfflineTrackPaths,
  resolveAuthServerId,
  runStorageScopeMigration,
} from "@/services/storageScopeMigration";

const LAN = "http://192.168.1.10:4533";
const OLD = legacyAuthScope(LAN, "alice"); // http___192_168_1_10_4533_alice
const NEW = "srv_1_alice";

const serversBlob = (
  servers: Array<Record<string, unknown>>,
  users: Array<Record<string, unknown>>,
) => JSON.stringify({ state: { servers, users }, version: 2 });

const remoteServers = () =>
  serversBlob(
    [{ id: "srv-1", url: LAN, type: "navidrome", name: "Home" }],
    [{ serverId: "srv-1", username: "alice" }],
  );

const wrap = (state: unknown) => JSON.stringify({ state, version: 0 });
const stateOf = (raw: string | undefined) => JSON.parse(raw ?? "{}").state;

beforeEach(() => {
  mockMem.clear();
  mockDirs.clear();
  mockFiles.clear();
  mockAuth.state = { isAuthenticated: false, serverId: "", url: "" };
  mockAuth.logout.mockClear();
  for (const fn of Object.values(mockSetStates)) fn.mockClear();
});

describe("buildScopeRemap", () => {
  it("maps a known (server, user) pair from url-scope to id-scope", () => {
    const remap = buildScopeRemap(remoteServers(), []);
    expect(remap.get(OLD)).toBe(NEW);
  });

  it("leaves local libraries alone — their scope never moves", () => {
    const raw = serversBlob(
      [{ id: "srv-local", url: "local", type: "local", name: "On device" }],
      [{ serverId: "srv-local", username: "local" }],
    );
    expect(buildScopeRemap(raw, ["local_local"]).size).toBe(0);
  });

  // The local scope has to survive the recovery pass too, which matches scopes
  // by url prefix against every *remote* server rather than by exact lookup.
  it("never remaps local_local when a remote server is present", () => {
    const raw = serversBlob(
      [
        { id: "srv-1", url: LAN, type: "navidrome", name: "Home" },
        { id: "srv-local", url: "local", type: "local", name: "On device" },
      ],
      [{ serverId: "srv-1", username: "alice" }],
    );
    const remap = buildScopeRemap(raw, ["local_local", OLD]);
    expect(remap.has("local_local")).toBe(false);
    expect(remap.get(OLD)).toBe(NEW);
  });

  it("recovers a scope whose user is no longer in the users list", () => {
    const raw = serversBlob(
      [{ id: "srv-1", url: LAN, type: "navidrome", name: "Home" }],
      [],
    );
    const orphan = legacyAuthScope(LAN, "bob");
    expect(buildScopeRemap(raw, [orphan]).get(orphan)).toBe("srv_1_bob");
  });

  it("prefers the longest matching url when one is a prefix of another", () => {
    // `https://x.com` and `https://x.com:4533` both prefix-match the scope
    // `https___x_com_4533_alice`; only the longer one reads it correctly.
    const raw = serversBlob(
      [
        { id: "short", url: "https://x.com", type: "navidrome", name: "A" },
        { id: "long", url: "https://x.com:4533", type: "navidrome", name: "B" },
      ],
      [],
    );
    const scope = legacyAuthScope("https://x.com:4533", "alice");
    expect(buildScopeRemap(raw, [scope]).get(scope)).toBe("long_alice");
  });

  it("returns an empty remap for a fresh install", () => {
    expect(buildScopeRemap(undefined, []).size).toBe(0);
  });
});

describe("runStorageScopeMigration", () => {
  it("renames every scoped key, including the queue's three and the query cache", () => {
    mockMem.set("servers", remoteServers());
    mockMem.set(`${OLD}:queueStore:queue`, "q");
    mockMem.set(`${OLD}:queueStore:shuffleOrder`, "s");
    mockMem.set(`${OLD}:queueStore:cursor`, "c");
    mockMem.set(`${OLD}:wavio-rq-cache`, "rq");
    mockMem.set(`${OLD}:bookmarks`, "b");

    runStorageScopeMigration();

    expect(mockMem.get(`${NEW}:queueStore:queue`)).toBe("q");
    expect(mockMem.get(`${NEW}:queueStore:shuffleOrder`)).toBe("s");
    expect(mockMem.get(`${NEW}:queueStore:cursor`)).toBe("c");
    expect(mockMem.get(`${NEW}:wavio-rq-cache`)).toBe("rq");
    expect(mockMem.get(`${NEW}:bookmarks`)).toBe("b");
    // Old keys are gone, so nothing re-reads the stale bucket.
    expect([...mockMem.keys()].some((k) => k.startsWith(`${OLD}:`))).toBe(
      false,
    );
  });

  it("moves the download directory AND rewrites the persisted track paths", () => {
    mockMem.set("servers", remoteServers());
    mockDirs.add(`/doc/offline/${OLD}`);
    mockMem.set(
      `${OLD}:offlineStore`,
      wrap({
        downloadedTracks: {
          t1: { id: "t1", path: `file:///doc/offline/${OLD}/t1.mp3` },
        },
      }),
    );

    runStorageScopeMigration();

    expect(mockDirs.has(`/doc/offline/${NEW}`)).toBe(true);
    expect(mockDirs.has(`/doc/offline/${OLD}`)).toBe(false);
    // Both halves, or the track points at a file that no longer exists.
    expect(
      stateOf(mockMem.get(`${NEW}:offlineStore`)).downloadedTracks.t1.path,
    ).toBe(`file:///doc/offline/${NEW}/t1.mp3`);
  });

  it("rewrites the scope tag on server podcast and radio favorites", () => {
    mockMem.set("servers", remoteServers());
    mockMem.set(`${OLD}:bookmarks`, "b");
    mockMem.set(
      "podcasts",
      wrap({
        favoritePodcasts: [
          { uuid: "p1", source: "server", scope: OLD },
          { uuid: "p2", source: "taddy" },
        ],
      }),
    );
    mockMem.set(
      "radioStations",
      wrap({
        favoriteRadioStations: [{ id: "r1", source: "server", scope: OLD }],
      }),
    );

    runStorageScopeMigration();

    const podcasts = mockSetStates.podcasts.mock.calls[0][0];
    expect(podcasts.favoritePodcasts[0].scope).toBe(NEW);
    // Server-independent favorites carry no scope and must stay untouched.
    expect(podcasts.favoritePodcasts[1].scope).toBeUndefined();
    const radio = mockSetStates.radioStations.mock.calls[0][0];
    expect(radio.favoriteRadioStations[0].scope).toBe(NEW);
  });

  // Navidrome and Jellyfin have no server-hosted podcasts, so their channels
  // live in the scope-keyed SQLite file (services/local/db.ts). Leave it behind
  // and db.ts opens an empty one — useSyncServerPodcastFavorites then reads that
  // as "deleted on the server" and prunes the favorites permanently.
  it("moves the scoped SQLite database and its WAL sidecars", () => {
    mockMem.set("servers", remoteServers());
    mockDirs.add("/doc/SQLite");
    for (const suffix of ["", "-wal", "-shm"]) {
      mockFiles.add(`/doc/SQLite/local-library-${OLD}.db${suffix}`);
    }

    runStorageScopeMigration();

    for (const suffix of ["", "-wal", "-shm"]) {
      expect(mockFiles.has(`/doc/SQLite/local-library-${NEW}.db${suffix}`)).toBe(
        true,
      );
      expect(mockFiles.has(`/doc/SQLite/local-library-${OLD}.db${suffix}`)).toBe(
        false,
      );
    }
  });

  // A local-only install has nothing to remap, so the run must be inert — its
  // database holds the entire catalog, not just podcasts.
  it("leaves a local-only install entirely untouched", () => {
    mockMem.set(
      "servers",
      serversBlob(
        [{ id: "srv-local", url: "local", type: "local", name: "On device" }],
        [{ serverId: "srv-local", username: "local" }],
      ),
    );
    mockMem.set("local_local:queueStore:queue", "q");
    mockDirs.add("/doc/SQLite");
    mockDirs.add("/doc/offline/local_local");
    mockFiles.add("/doc/SQLite/local-library-local_local.db");
    mockAuth.state = {
      isAuthenticated: true,
      serverId: "srv-local",
      url: "local",
    };

    runStorageScopeMigration();

    expect(mockFiles.has("/doc/SQLite/local-library-local_local.db")).toBe(true);
    expect(mockMem.get("local_local:queueStore:queue")).toBe("q");
    expect(mockDirs.has("/doc/offline/local_local")).toBe(true);
    expect(mockAuth.logout).not.toHaveBeenCalled();
  });

  // The local library signs in with the fixed `local` sentinel url, which must
  // still resolve a serverId — otherwise the back-fill signs the user out.
  it("back-fills a local session's serverId instead of signing it out", () => {
    mockMem.set(
      "servers",
      serversBlob(
        [
          { id: "srv-1", url: LAN, type: "navidrome", name: "Home" },
          { id: "srv-local", url: "local", type: "local", name: "On device" },
        ],
        [{ serverId: "srv-1", username: "alice" }],
      ),
    );
    mockAuth.state = { isAuthenticated: true, serverId: "", url: "local" };

    runStorageScopeMigration();

    expect(mockAuth.state.serverId).toBe("srv-local");
    expect(mockAuth.logout).not.toHaveBeenCalled();
  });

  // The on-device library keeps the fixed `local_local` sentinel, so its
  // database — which holds the whole catalog, not just podcasts — must not move.
  it("never touches the local library's database", () => {
    mockMem.set(
      "servers",
      serversBlob(
        [
          { id: "srv-1", url: LAN, type: "navidrome", name: "Home" },
          { id: "srv-local", url: "local", type: "local", name: "On device" },
        ],
        [
          { serverId: "srv-1", username: "alice" },
          { serverId: "srv-local", username: "local" },
        ],
      ),
    );
    mockDirs.add("/doc/SQLite");
    mockFiles.add("/doc/SQLite/local-library-local_local.db");
    mockFiles.add(`/doc/SQLite/local-library-${OLD}.db`);

    runStorageScopeMigration();

    expect(mockFiles.has("/doc/SQLite/local-library-local_local.db")).toBe(true);
    // Only the remote server's database moved.
    expect(mockFiles.has(`/doc/SQLite/local-library-${NEW}.db`)).toBe(true);
  });

  it("leaves an already-migrated database alone rather than clobbering it", () => {
    mockMem.set("servers", remoteServers());
    mockDirs.add("/doc/SQLite");
    mockFiles.add(`/doc/SQLite/local-library-${OLD}.db`);
    mockFiles.add(`/doc/SQLite/local-library-${NEW}.db`);

    runStorageScopeMigration();

    expect(mockFiles.has(`/doc/SQLite/local-library-${NEW}.db`)).toBe(true);
  });

  it("rekeys the musicFolders selections map", () => {
    mockMem.set("servers", remoteServers());
    mockMem.set(`${OLD}:bookmarks`, "b");
    mockMem.set("musicFolders", wrap({ selections: { [OLD]: "folder-9" } }));

    runStorageScopeMigration();

    expect(mockSetStates.musicFolders.mock.calls[0][0].selections).toEqual({
      [NEW]: "folder-9",
    });
  });

  it("back-fills the auth serverId from the signed-in url", () => {
    mockMem.set("servers", remoteServers());
    mockAuth.state = { isAuthenticated: true, serverId: "", url: LAN };

    runStorageScopeMigration();

    expect(mockAuth.state.serverId).toBe("srv-1");
    expect(mockAuth.logout).not.toHaveBeenCalled();
  });

  it("signs out a session whose server row is gone rather than sharing a bucket", () => {
    mockMem.set("servers", remoteServers());
    mockAuth.state = {
      isAuthenticated: true,
      serverId: "",
      url: "https://deleted.example.com",
    };

    runStorageScopeMigration();

    expect(mockAuth.logout).toHaveBeenCalled();
  });

  it("is a no-op on re-run and does not re-move data", () => {
    mockMem.set("servers", remoteServers());
    mockMem.set(`${OLD}:bookmarks`, "b");
    runStorageScopeMigration();
    expect(hasRunStorageScopeMigration()).toBe(true);

    // A second launch: put a decoy under the old key and prove it's left alone.
    mockMem.set(`${OLD}:bookmarks`, "stale");
    runStorageScopeMigration();
    expect(mockMem.get(`${NEW}:bookmarks`)).toBe("b");
    expect(mockMem.get(`${OLD}:bookmarks`)).toBe("stale");
  });

  it("does not write the sentinel when the servers blob is unparseable", () => {
    mockMem.set("servers", "{not json");
    mockMem.set(`${OLD}:bookmarks`, "b");

    runStorageScopeMigration();

    // No sentinel => the next launch retries instead of orphaning this install.
    expect(hasRunStorageScopeMigration()).toBe(false);
    expect(mockMem.get(`${OLD}:bookmarks`)).toBe("b");
  });

  it("recovers when a previous run was interrupted after the directory move", () => {
    mockMem.set("servers", remoteServers());
    mockMem.set(`${OLD}:bookmarks`, "b");
    // Directory already at its destination, keys not yet renamed.
    mockDirs.add(`/doc/offline/${NEW}`);

    runStorageScopeMigration();

    expect(mockMem.get(`${NEW}:bookmarks`)).toBe("b");
    expect(hasRunStorageScopeMigration()).toBe(true);
  });

  it("marks a fresh install done without touching anything", () => {
    runStorageScopeMigration();
    expect(hasRunStorageScopeMigration()).toBe(true);
  });
});

describe("remapOfflineTrackPaths", () => {
  it("returns null when no path belongs to the old scope", () => {
    const raw = wrap({
      downloadedTracks: { t1: { path: "file:///doc/offline/other/t1.mp3" } },
    });
    expect(remapOfflineTrackPaths(raw, OLD, NEW)).toBeNull();
  });

  it("ignores a blob with no downloaded tracks", () => {
    expect(remapOfflineTrackPaths(wrap({}), OLD, NEW)).toBeNull();
    expect(remapOfflineTrackPaths(undefined, OLD, NEW)).toBeNull();
  });
});

describe("resolveAuthServerId", () => {
  it("matches on the exact url", () => {
    expect(resolveAuthServerId(LAN, remoteServers())).toBe("srv-1");
  });

  it("resolves the local library via its sentinel url", () => {
    const raw = serversBlob(
      [{ id: "srv-local", url: "local", type: "local", name: "On device" }],
      [],
    );
    expect(resolveAuthServerId("local", raw)).toBe("srv-local");
  });

  it("returns null when no server matches", () => {
    expect(
      resolveAuthServerId("https://gone.example.com", remoteServers()),
    ).toBeNull();
  });
});
