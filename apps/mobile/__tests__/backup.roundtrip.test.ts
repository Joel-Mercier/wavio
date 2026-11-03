const mockMem = new Map<string, string>();
const mockFiles = new Map<string, string>();
const mockWrites: string[] = [];
jest.mock("@/config/storage", () => ({
  storage: {
    set: (k: string, v: string) => mockMem.set(k, v),
    getString: (k: string) => mockMem.get(k),
    remove: (k: string) => mockMem.delete(k),
    getAllKeys: () => [...mockMem.keys()],
  },
  flushPendingScopedWrites: () => {},
  notePersistedWrite: () => {},
}));

jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.2.3" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(...segments: string[]) {
      this.uri = segments.join("/");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    create() {
      mockFiles.set(this.uri, "");
    }
    async write(chunk: string, options?: { append?: boolean }) {
      mockWrites.push(chunk);
      const before = options?.append ? (mockFiles.get(this.uri) ?? "") : "";
      mockFiles.set(this.uri, before + chunk);
    }
  },
  Paths: { document: "/doc", cache: "/cache" },
  Directory: class {
    path: string;
    constructor(...segments: string[]) {
      this.path = segments.join("/");
    }
    get exists() {
      return false;
    }
    moveSync() {}
  },
}));
jest.mock("react-native-share", () => ({ default: { open: jest.fn() } }));
jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));
jest.mock("@/stores/auth", () => ({ useAuthBase: { getState: () => ({}) } }));

const mockServersState = {
  servers: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  getServerById: (id: string) =>
    mockServersState.servers.find((s) => s.id === id),
  getServerByUrl: (url: string) =>
    mockServersState.servers.find((s) => s.url === url),
};
const rehydrate = () => Promise.resolve();
jest.mock("@/stores/servers", () => ({
  useServersBase: {
    getState: () => mockServersState,
    persist: { rehydrate },
  },
}));
jest.mock("@/stores/app", () => ({ useAppBase: { persist: { rehydrate } } }));
jest.mock("@/stores/musicFolders", () => ({
  __esModule: true,
  default: { persist: { rehydrate } },
  useMusicFoldersBase: { setState: jest.fn() },
}));
jest.mock("@/stores/podcasts", () => ({
  __esModule: true,
  default: { persist: { rehydrate } },
  usePodcastsBase: { setState: jest.fn() },
}));
const mockOidcSetState = jest.fn();
jest.mock("@/stores/oidc", () => ({
  useOidcBase: { setState: (s: unknown) => mockOidcSetState(s) },
}));
jest.mock("@/stores/radioStations", () => ({
  useRadioStationsBase: { setState: jest.fn() },
}));

import { File } from "expo-file-system";
import {
  type BackupFile,
  buildBackup,
  restoreBackup,
  writeBackupFile,
} from "@/services/backup";
import { legacyAuthScope } from "@/services/storageScopeMigration";

const LAN = "http://192.168.1.10:4533";
const OLD = legacyAuthScope(LAN, "alice");
const NEW = "srv_1_alice";

const server = { id: "srv-1", url: LAN, type: "navidrome", name: "Home" };
const serversBlob = JSON.stringify({
  state: {
    servers: [server],
    users: [{ serverId: "srv-1", username: "alice" }],
  },
  version: 2,
});

const authBlob = (state: Record<string, unknown>) =>
  JSON.stringify({ state, version: 4 });

beforeEach(() => {
  mockMem.clear();
  mockFiles.clear();
  mockWrites.length = 0;
  mockServersState.servers = [server];
  mockServersState.users = [{ serverId: "srv-1", username: "alice" }];
});

describe("writeBackupFile", () => {
  const written = async () => {
    const file = new File("/cache", "backup.json");
    await writeBackupFile(file);
    return mockFiles.get(file.uri) ?? "";
  };
  const withoutTimestamp = (backup: BackupFile) => ({
    ...backup,
    exportedAt: "",
  });

  it("streams exactly what buildBackup builds", async () => {
    mockMem.set(
      "auth",
      authBlob({ serverId: "srv-1", url: LAN, password: "hunter2" }),
    );
    mockMem.set("servers", serversBlob);
    mockMem.set("app", JSON.stringify({ state: { q: 'quote " and \\' } }));
    mockMem.set(`${NEW}:bookmarks`, "b");
    mockMem.set(`${NEW}:offlineMutations`, "pending");
    mockMem.set(`${NEW}:wavio-rq:["album","1"]`, "cached");
    const text = await written();
    expect(withoutTimestamp(JSON.parse(text))).toEqual(
      withoutTimestamp(buildBackup()),
    );
    expect(text).not.toContain("hunter2");
  });

  it("writes a multi-megabyte value in chunks without splitting surrogate pairs", async () => {
    // A pair straddling every escape slice boundary.
    const unit = `${"a".repeat(64 * 1024 - 1)}\u{1F3B5}`;
    const big = unit.repeat(40);
    mockMem.set(`${NEW}:playHistory`, big);
    const text = await written();
    expect(mockWrites.length).toBeGreaterThan(1);
    expect(Math.max(...mockWrites.map((chunk) => chunk.length))).toBeLessThan(
      300 * 1024,
    );
    const entry = (JSON.parse(text) as BackupFile).scoped.find(
      (s) => s.scope === NEW,
    );
    expect(entry?.values.playHistory).toBe(big);
    expect(text).not.toMatch(/\\ud[89ab]/i);
  });

  it("produces a file restoreBackup accepts", async () => {
    mockMem.set("servers", serversBlob);
    mockMem.set(`${NEW}:bookmarks`, "b");
    const text = await written();
    mockMem.clear();
    await restoreBackup(JSON.parse(text));
    expect(mockMem.get(`${NEW}:bookmarks`)).toBe("b");
  });
});

describe("buildBackup", () => {
  it("collects scopes by server id and stamps the current version", () => {
    mockMem.set(`${NEW}:bookmarks`, "b");
    const backup = buildBackup();
    expect(backup.version).toBe(2);
    expect(backup.scoped.map((s) => s.scope)).toContain(NEW);
  });

  it("uses the fixed sentinel scope for a local library", () => {
    mockServersState.servers = [
      { id: "srv-local", url: "local", type: "local", name: "On device" },
    ];
    mockServersState.users = [{ serverId: "srv-local", username: "local" }];
    expect(buildBackup().scoped.map((s) => s.scope)).toContain("local_local");
  });

  it("excludes the offline-mutations queue from the file", () => {
    mockMem.set(`${NEW}:offlineMutations`, "pending");
    mockMem.set(`${NEW}:bookmarks`, "b");
    const entry = buildBackup().scoped.find((s) => s.scope === NEW);
    expect(entry?.values.offlineMutations).toBeUndefined();
    expect(entry?.values.bookmarks).toBe("b");
  });

  it("excludes the library-sync store from the file", () => {
    mockMem.set(`${NEW}:librarySyncStore`, "synced");
    mockMem.set(`${NEW}:bookmarks`, "b");
    const entry = buildBackup().scoped.find((s) => s.scope === NEW);
    expect(entry?.values.librarySyncStore).toBeUndefined();
    expect(entry?.values.bookmarks).toBe("b");
  });

  it("excludes the React Query cache from the file", () => {
    mockMem.set(`${NEW}:wavio-rq:["album","1"]`, "cached");
    mockMem.set(`${NEW}:wavio-rq-touched`, "1");
    mockMem.set(`${NEW}:wavio-rq-cache`, "legacy");
    mockMem.set(`${NEW}:bookmarks`, "b");
    const entry = buildBackup().scoped.find((s) => s.scope === NEW);
    expect(Object.keys(entry?.values ?? {})).toEqual(["bookmarks"]);
  });

  it("strips the active session's secrets but keeps the re-login identity", () => {
    mockMem.set(
      "auth",
      authBlob({
        serverId: "srv-1",
        url: LAN,
        username: "alice",
        isAuthenticated: true,
        password: "hunter2",
        token: "nd-token",
        subsonicSalt: "salt",
        subsonicToken: "tok",
        jellyfinAccessToken: "jf-token",
      }),
    );
    const restored = JSON.parse(buildBackup().global.auth);
    expect(restored.state).toMatchObject({
      serverId: "srv-1",
      username: "alice",
      // Never restored as signed in: the restored account opens on the login
      // form, even after a crash before the restore dialog is dismissed.
      isAuthenticated: false,
      password: "",
      token: null,
      subsonicSalt: null,
      subsonicToken: null,
      jellyfinAccessToken: null,
    });
    expect(restored.version).toBe(4);
  });

  it("drops opt-in saved passwords from the servers blob", () => {
    mockMem.set(
      "servers",
      JSON.stringify({
        state: {
          servers: [server],
          users: [
            { serverId: "srv-1", username: "alice", password: "hunter2" },
            { serverId: "srv-1", username: "bob" },
          ],
        },
        version: 2,
      }),
    );
    const restored = JSON.parse(buildBackup().global.servers);
    expect(restored.state.users).toEqual([
      { serverId: "srv-1", username: "alice" },
      { serverId: "srv-1", username: "bob" },
    ]);
    expect(restored.state.servers).toEqual([server]);
  });

  it("omits an auth blob it cannot parse instead of exporting it raw", () => {
    mockMem.set("auth", "not json {");
    expect(buildBackup().global.auth).toBeUndefined();
  });
});

describe("backup credentials", () => {
  const stateOf = (blob: string | undefined) =>
    JSON.parse(blob ?? "{}").state as Record<string, unknown>;

  it("drops custom header values along with saved passwords", () => {
    mockMem.set(
      "servers",
      JSON.stringify({
        state: {
          servers: [
            { ...server, headers: { "CF-Access-Client-Secret": "shh" } },
          ],
          users: [{ serverId: "srv-1", username: "alice", password: "pw" }],
        },
        version: 2,
      }),
    );
    const text = JSON.stringify(buildBackup());
    expect(text).not.toContain("shh");
    expect(text).not.toContain("CF-Access-Client-Secret");
    expect(text).not.toContain('"pw"');
    const servers = stateOf(buildBackup().global.servers).servers as Array<
      Record<string, unknown>
    >;
    expect(servers[0]).toMatchObject({ id: "srv-1", url: LAN });
  });

  it("strips every integration's credentials and connection flag", () => {
    mockMem.set(
      "podcasts",
      authBlob({
        taddyPodcastsApiKey: "SECRET-taddy",
        taddyPodcastsUserId: "SECRET-taddy-user",
      }),
    );
    mockMem.set(
      `${NEW}:lastFmStore`,
      authBlob({
        sessionKey: "SECRET-lfm",
        userName: "alice",
        scrobblingEnabled: true,
      }),
    );
    mockMem.set(`${NEW}:listenBrainzStore`, authBlob({ token: "SECRET-lb" }));
    mockMem.set(
      `${NEW}:lidarrStore`,
      authBlob({
        serverUrl: "http://lidarr",
        apiKey: "SECRET-lidarr",
        isConnected: true,
      }),
    );
    mockMem.set(
      `${NEW}:audioMuseStore`,
      authBlob({
        apiToken: "SECRET-am",
        fingerprintSecret: "SECRET-fp",
        isConnected: true,
      }),
    );
    const backup = buildBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain("SECRET");
    const values = backup.scoped.find((s) => s.scope === NEW)?.values ?? {};
    // Settings survive; only the credential and its connection flag go.
    expect(stateOf(values.lastFmStore)).toEqual({
      userName: "alice",
      scrobblingEnabled: true,
    });
    expect(stateOf(values.lidarrStore)).toEqual({ serverUrl: "http://lidarr" });
  });

  it("strips credentials from an older file on the way in", async () => {
    await restoreBackup({
      version: 2,
      appVersion: "1.3.0",
      exportedAt: "2026-01-01T00:00:00.000Z",
      global: {
        servers: serversBlob,
        auth: authBlob({
          serverId: "srv-1",
          url: LAN,
          username: "alice",
          isAuthenticated: true,
          password: "hunter2",
          token: "nd-token",
        }),
      },
      scoped: [
        {
          scope: NEW,
          values: { listenBrainzStore: authBlob({ token: "lb" }) },
        },
      ],
    });
    expect(stateOf(mockMem.get("auth"))).toMatchObject({
      isAuthenticated: false,
      password: "",
      token: null,
    });
    expect(stateOf(mockMem.get(`${NEW}:listenBrainzStore`))).toEqual({});
  });

  it("forgets single-sign-on sessions, so nothing signs in silently", async () => {
    await restoreBackup({
      version: 2,
      appVersion: "1.3.0",
      exportedAt: "2026-01-01T00:00:00.000Z",
      global: { servers: serversBlob },
      scoped: [],
    });
    expect(mockOidcSetState).toHaveBeenCalledWith(
      expect.objectContaining({ sessions: {} }),
    );
  });
});

describe("restoreBackup", () => {
  const v1: BackupFile = {
    version: 1,
    appVersion: "1.0.0",
    exportedAt: "2026-01-01T00:00:00.000Z",
    global: { servers: serversBlob },
    scoped: [{ scope: OLD, values: { bookmarks: "b" } }],
  };

  it("remaps a v1 file's url-scopes onto the id-based scheme", async () => {
    await restoreBackup(v1);
    // Restored under the scope the app actually reads.
    expect(mockMem.get(`${NEW}:bookmarks`)).toBe("b");
    expect(mockMem.get(`${OLD}:bookmarks`)).toBeUndefined();
  });

  it("repoints a v1 file's offline track paths at the moved directory", async () => {
    const offlineStore = JSON.stringify({
      state: {
        downloadedTracks: {
          t1: { id: "t1", path: `file:///doc/offline/${OLD}/t1.mp3` },
        },
      },
      version: 0,
    });
    await restoreBackup({
      ...v1,
      scoped: [{ scope: OLD, values: { offlineStore } }],
    });
    const restored = JSON.parse(mockMem.get(`${NEW}:offlineStore`) ?? "{}");
    expect(restored.state.downloadedTracks.t1.path).toBe(
      `file:///doc/offline/${NEW}/t1.mp3`,
    );
  });

  it("writes a v2 file's scopes verbatim", async () => {
    await restoreBackup({
      ...v1,
      version: 2,
      scoped: [{ scope: NEW, values: { bookmarks: "b" } }],
    });
    expect(mockMem.get(`${NEW}:bookmarks`)).toBe("b");
  });

  it("resolves the re-login target by serverId when the backup has one", async () => {
    const outcome = await restoreBackup({
      ...v1,
      version: 2,
      global: {
        servers: serversBlob,
        auth: authBlob({
          serverId: "srv-1",
          url: "https://stale.example.com",
          username: "alice",
          isAuthenticated: true,
        }),
      },
      scoped: [],
    });
    // serverId wins over the url, which may since have changed.
    expect(outcome).toEqual({ serverId: "srv-1", username: "alice" });
  });

  it("falls back to the url for a v1 auth blob that predates serverId", async () => {
    const outcome = await restoreBackup({
      ...v1,
      global: {
        servers: serversBlob,
        auth: authBlob({ url: LAN, username: "alice", isAuthenticated: true }),
      },
      scoped: [],
    });
    expect(outcome).toEqual({ serverId: "srv-1", username: "alice" });
  });

  it("reports no target when the backup had no authenticated session", async () => {
    const outcome = await restoreBackup({ ...v1, scoped: [] });
    expect(outcome).toEqual({ serverId: null, username: null });
  });
});
