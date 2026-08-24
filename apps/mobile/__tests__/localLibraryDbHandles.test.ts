// expo-sqlite runs every call on a thread pool, so closing a handle while a
// statement is still running finalizes that statement out from under the thread
// using it and aborts the process (SIGABRT, "corrupted chunk header") — a native
// abort no call site can catch. What keeps that from happening is entirely in
// db.ts's handle bookkeeping: a scope change must not close the handle it is
// switching away from, and an explicit close must wait for in-flight statements.

let mockScope = "server_a";
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => mockScope,
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

type FakeDb = {
  name: string;
  closed: boolean;
  closeAsync: jest.Mock;
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  withExclusiveTransactionAsync: jest.Mock;
};

const opened: FakeDb[] = [];
const deleted: string[] = [];

// Enough of the surface for `migrate` to run through: every column already
// exists and `user_version` is current, so no migration statement fires.
const makeDb = (name: string): FakeDb => {
  const db: FakeDb = {
    name,
    closed: false,
    closeAsync: jest.fn(async () => {
      db.closed = true;
    }),
    execAsync: jest.fn(async () => {}),
    runAsync: jest.fn(async () => {}),
    getAllAsync: jest.fn(async () => [
      { name: "release_types_json" },
      { name: "source_folder" },
      { name: "author" },
      { name: "reason" },
      { name: "resolved_album_key" },
      { name: "resolved_artist_key" },
    ]),
    getFirstAsync: jest.fn(async () => ({ user_version: 6 })),
    withExclusiveTransactionAsync: jest.fn(async () => {}),
  };
  return db;
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(async (name: string) => {
    const db = makeDb(name);
    opened.push(db);
    return db;
  }),
  deleteDatabaseAsync: jest.fn(async (name: string) => {
    deleted.push(name);
  }),
}));

// Handles are memoized for the lifetime of the module, so each case gets a
// fresh copy of it rather than inheriting whatever the previous one left open.
type DbModule = typeof import("@/services/local/db");
let closeLocalLibraryDb: DbModule["closeLocalLibraryDb"];
let deleteLocalLibraryDb: DbModule["deleteLocalLibraryDb"];
let getLocalLibraryDb: DbModule["getLocalLibraryDb"];

beforeEach(() => {
  jest.resetModules();
  opened.length = 0;
  deleted.length = 0;
  mockScope = "server_a";
  ({ closeLocalLibraryDb, deleteLocalLibraryDb, getLocalLibraryDb } =
    require("@/services/local/db") as DbModule);
});

describe("local library database handles", () => {
  it("opens one file per scope and reuses it", async () => {
    const first = await getLocalLibraryDb();
    const again = await getLocalLibraryDb();

    expect(again).toBe(first);
    expect(opened).toHaveLength(1);
    expect(opened[0].name).toBe("local-library-server_a.db");
  });

  it("leaves the previous scope's handle open across a scope change", async () => {
    await getLocalLibraryDb();
    mockScope = "server_b";
    await getLocalLibraryDb();

    expect(opened.map((d) => d.name)).toEqual([
      "local-library-server_a.db",
      "local-library-server_b.db",
    ]);
    // The crash: closing this one races whatever is still querying it.
    expect(opened[0].closeAsync).not.toHaveBeenCalled();
  });

  it("hands a scope its own handle back after switching away and returning", async () => {
    const a = await getLocalLibraryDb();
    mockScope = "server_b";
    await getLocalLibraryDb();
    mockScope = "server_a";

    expect(await getLocalLibraryDb()).toBe(a);
    expect(opened).toHaveLength(2);
  });

  it("waits for an in-flight statement before closing", async () => {
    const db = await getLocalLibraryDb();

    let finishQuery: (rows: unknown[]) => void = () => {};
    opened[0].getAllAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishQuery = resolve;
        }),
    );

    const query = db.getAllAsync("SELECT 1");
    let closed = false;
    const close = closeLocalLibraryDb().then(() => {
      closed = true;
    });

    // A full macrotask, not one microtask: without the gate the close chain
    // resolves through several awaits and would already be done by here.
    await new Promise((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    expect(opened[0].closeAsync).not.toHaveBeenCalled();

    finishQuery([]);
    await query;
    await close;
    expect(opened[0].closeAsync).toHaveBeenCalled();
  });

  it("re-opens on the next call after a close", async () => {
    await getLocalLibraryDb();
    await closeLocalLibraryDb();
    await getLocalLibraryDb();

    expect(opened).toHaveLength(2);
    expect(opened[0].closed).toBe(true);
    expect(opened[1].closed).toBe(false);
  });

  it("closes a targeted scope before deleting its file", async () => {
    await getLocalLibraryDb();
    mockScope = "server_b";
    await getLocalLibraryDb();

    await deleteLocalLibraryDb("server_a");

    expect(opened[0].closeAsync).toHaveBeenCalled();
    expect(opened[1].closeAsync).not.toHaveBeenCalled();
    expect(deleted).toEqual(["local-library-server_a.db"]);
  });

  it("refuses to open an index for a cleared session", async () => {
    // What sign-out leaves behind: no server id, no username. Opening here would
    // create an orphan file and write the departed session's rows into it.
    mockScope = "_";

    await expect(getLocalLibraryDb()).rejects.toThrow(/No signed-in session/);
    expect(opened).toHaveLength(0);
  });

  it("still opens for the on-device library's sentinel scope", async () => {
    mockScope = "local_local";

    await expect(getLocalLibraryDb()).resolves.toBeDefined();
    expect(opened[0].name).toBe("local-library-local_local.db");
  });

  it("does not memoize a failed open", async () => {
    const sqlite = jest.requireMock("expo-sqlite");
    sqlite.openDatabaseAsync.mockRejectedValueOnce(new Error("disk full"));

    await expect(getLocalLibraryDb()).rejects.toThrow("disk full");
    await expect(getLocalLibraryDb()).resolves.toBeDefined();
  });
});
