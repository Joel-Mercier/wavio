const mockMem = new Map<string, string>();
jest.mock("@/config/storage", () => ({
  storage: {
    set: (k: string, v: string) => mockMem.set(k, v),
    getString: (k: string) => mockMem.get(k),
    remove: (k: string) => mockMem.delete(k),
    getAllKeys: () => [...mockMem.keys()],
  },
}));

jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.2.3" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system", () => ({
  File: class {},
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
jest.mock("@/stores/radioStations", () => ({
  useRadioStationsBase: { setState: jest.fn() },
}));

import { type BackupFile, buildBackup, restoreBackup } from "@/services/backup";
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
  mockServersState.servers = [server];
  mockServersState.users = [{ serverId: "srv-1", username: "alice" }];
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
      isAuthenticated: true,
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
