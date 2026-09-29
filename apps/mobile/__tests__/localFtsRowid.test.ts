// `tracks.fts_rowid` turns every per-track FTS delete into a rowid seek (issue
// #211). The risk is in the migration and in the states older app versions
// leave behind, so this runs the real `migrate()` and the real FTS helpers
// against a real SQLite engine (node's built-in) behind a thin adapter for the
// expo-sqlite async surface they use.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type Params = SQLInputValue[] | [Record<string, SQLInputValue>];

const mockState: {
  raw: DatabaseSync | null;
  failOn: RegExp | null;
  statements: string[];
} = {
  raw: null,
  failOn: null,
  statements: [],
};

function mockAdapter() {
  const raw = () => {
    if (!mockState.raw) throw new Error("no database");
    return mockState.raw;
  };
  const check = (sql: string) => {
    mockState.statements.push(sql);
    if (mockState.failOn?.test(sql)) throw new Error(`injected: ${sql}`);
  };
  const bind = (params: unknown[]): Params =>
    (params.length === 1 && Array.isArray(params[0])
      ? params[0]
      : params) as Params;
  return {
    execAsync: async (sql: string) => {
      check(sql);
      raw().exec(sql);
    },
    getAllAsync: async (sql: string, ...params: unknown[]) => {
      check(sql);
      return raw()
        .prepare(sql)
        .all(...(bind(params) as SQLInputValue[]));
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      check(sql);
      return (
        raw()
          .prepare(sql)
          .get(...(bind(params) as SQLInputValue[])) ?? null
      );
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      check(sql);
      const r = raw()
        .prepare(sql)
        .run(...(bind(params) as SQLInputValue[]));
      return {
        changes: Number(r.changes),
        lastInsertRowId: Number(r.lastInsertRowid),
      };
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw().exec("BEGIN");
      try {
        await fn();
        raw().exec("COMMIT");
      } catch (error) {
        raw().exec("ROLLBACK");
        throw error;
      }
    },
    closeAsync: async () => {},
  };
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(async () => mockAdapter()),
  deleteDatabaseAsync: jest.fn(),
}));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import type { SQLiteDatabase } from "expo-sqlite";
import { closeLocalLibraryDb, getLocalLibraryDb } from "@/services/local/db";
import { replaceFtsRow } from "@/services/local/ftsRows";
import { upsertTrackOverride } from "@/services/local/tagOverrides";
import { searchVariants } from "@/services/searchText";

const TRACKS: Array<[id: string, title: string, artist: string]> = [
  ["t1", "Hæd", "Alpha"],
  ["t2", "Second Song", "Beta"],
  ["t3", "Third Song", "Gamma"],
  ["t4", "Fourth Song", "Delta"],
];

const raw = (): DatabaseSync => {
  if (!mockState.raw) throw new Error("no database");
  return mockState.raw;
};

async function reopen(): Promise<SQLiteDatabase> {
  await closeLocalLibraryDb();
  return getLocalLibraryDb();
}

// How 1.3.x wrote a track: FTS row by id, `tracks` row without `fts_rowid`.
function writeLegacyTrack(id: string, title: string, artist: string) {
  raw()
    .prepare(
      "INSERT OR REPLACE INTO tracks (id, uri, title, artist, indexed_at) VALUES (?, ?, ?, ?, 0)",
    )
    .run(id, `file:///${id}.mp3`, title, artist);
  raw()
    .prepare(
      "INSERT INTO tracks_fts (id, title, artist, album, album_artist, normalized) VALUES (?, ?, ?, NULL, NULL, ?)",
    )
    .run(id, title, artist, searchVariants([title, artist]));
}

// How this version writes one (see indexer.writeTrack): FTS row first, then the
// `tracks` REPLACE carrying its rowid.
async function writeTrack(
  db: SQLiteDatabase,
  id: string,
  title: string,
  artist: string,
) {
  const ftsRowid = await replaceFtsRow(db, {
    id,
    title,
    artist,
    album: null,
    album_artist: null,
  });
  await db.runAsync(
    "INSERT OR REPLACE INTO tracks (id, uri, title, artist, indexed_at, fts_rowid) VALUES (?, ?, ?, ?, 0, ?)",
    id,
    `file:///${id}.mp3`,
    title,
    artist,
    ftsRowid,
  );
}

const userVersion = () =>
  (raw().prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;

const match = (query: string) =>
  (
    raw()
      .prepare("SELECT id FROM tracks_fts WHERE tracks_fts MATCH ? ORDER BY id")
      .all(query) as { id: string }[]
  ).map((r) => r.id);

function expectOneMappedRowPerTrack() {
  const tracks = raw()
    .prepare("SELECT id, fts_rowid FROM tracks ORDER BY id")
    .all() as { id: string; fts_rowid: number | null }[];
  const fts = raw().prepare("SELECT rowid AS r, id FROM tracks_fts").all() as {
    r: number;
    id: string;
  }[];
  expect(fts).toHaveLength(tracks.length);
  for (const t of tracks) {
    expect(fts.find((f) => f.r === t.fts_rowid)?.id).toBe(t.id);
  }
}

beforeEach(async () => {
  await closeLocalLibraryDb();
  mockState.raw = new DatabaseSync(":memory:");
  mockState.failOn = null;
  mockState.statements = [];
});

afterEach(() => {
  mockState.raw?.close();
});

const ftsDeletes = () =>
  mockState.statements.filter((sql) =>
    sql.startsWith("DELETE FROM tracks_fts"),
  );

describe("migration to v9", () => {
  it("creates the column on a fresh install, with nothing to backfill", async () => {
    const db = await getLocalLibraryDb();
    expect(userVersion()).toBe(9);
    for (const [id, title, artist] of TRACKS) {
      await writeTrack(db, id, title, artist);
    }
    expectOneMappedRowPerTrack();
    expect(match("haed")).toEqual(["t1"]);
  });

  it("maps a v8 index, dropping orphan and duplicate rows and filling gaps", async () => {
    await getLocalLibraryDb();
    for (const [id, title, artist] of TRACKS.slice(0, 3)) {
      writeLegacyTrack(id, title, artist);
    }
    // t1's row twice, a row for a track that no longer exists, and t4 with no
    // row at all.
    raw()
      .prepare(
        "INSERT INTO tracks_fts (id, title, artist) VALUES ('t1', 'Hæd', 'Alpha')",
      )
      .run();
    raw()
      .prepare("INSERT INTO tracks_fts (id, title) VALUES ('ghost', 'Ghost')")
      .run();
    raw()
      .prepare(
        "INSERT INTO tracks (id, uri, title, artist, indexed_at) VALUES ('t4', 'file:///t4.mp3', 'Fourth Song', 'Delta', 0)",
      )
      .run();
    raw().exec("PRAGMA user_version = 8");

    await reopen();

    expect(userVersion()).toBe(9);
    expectOneMappedRowPerTrack();
    expect(match("ghost")).toEqual([]);
    expect(match("song")).toEqual(["t2", "t3", "t4"]);
    expect(match("haed")).toEqual(["t1"]);
  });

  it("rebuilds a v7 index's old-shape table and maps it", async () => {
    await getLocalLibraryDb();
    raw().exec(`
      DROP TABLE tracks_fts;
      CREATE VIRTUAL TABLE tracks_fts USING fts5(
        id UNINDEXED, title, artist, album, album_artist
      );
    `);
    for (const [id, title, artist] of TRACKS) {
      raw()
        .prepare(
          "INSERT INTO tracks (id, uri, title, artist, indexed_at) VALUES (?, ?, ?, ?, 0)",
        )
        .run(id, `file:///${id}.mp3`, title, artist);
      raw()
        .prepare("INSERT INTO tracks_fts (id, title, artist) VALUES (?, ?, ?)")
        .run(id, title, artist);
    }
    raw().exec("PRAGMA user_version = 7");

    await reopen();

    expect(userVersion()).toBe(9);
    expectOneMappedRowPerTrack();
    // Only the rebuilt `normalized` column spells "Hæd" this way.
    expect(match("haed")).toEqual(["t1"]);
  });

  it("rolls back a backfill that fails partway, and retries on the next open", async () => {
    await getLocalLibraryDb();
    for (const [id, title, artist] of TRACKS.slice(0, 3)) {
      writeLegacyTrack(id, title, artist);
    }
    raw()
      .prepare(
        "INSERT INTO tracks (id, uri, title, artist, indexed_at) VALUES ('t4', 'file:///t4.mp3', 'Fourth Song', 'Delta', 0)",
      )
      .run();
    raw().exec("PRAGMA user_version = 8");

    // Past the set-based mapping, while filling t4's missing row.
    mockState.failOn = /UPDATE tracks SET fts_rowid = \? WHERE id = \?/;
    await closeLocalLibraryDb();
    await expect(getLocalLibraryDb()).rejects.toThrow("injected");

    expect(userVersion()).toBe(8);
    const mapped = raw()
      .prepare("SELECT COUNT(*) AS n FROM tracks WHERE fts_rowid IS NOT NULL")
      .get() as { n: number };
    expect(mapped.n).toBe(0);

    // Writes in the meantime take the by-id path and stay correct.
    mockState.failOn = null;
    const db = mockAdapter() as unknown as SQLiteDatabase;
    await writeTrack(db, "t2", "Second Song Remix", "Beta");
    expect(match("remix")).toEqual(["t2"]);

    await getLocalLibraryDb();
    expect(userVersion()).toBe(9);
    expectOneMappedRowPerTrack();
  });
});

describe("replaceFtsRow", () => {
  it("issues no delete for a track that has never been written", async () => {
    const db = await getLocalLibraryDb();
    mockState.statements = [];
    await writeTrack(db, "t1", "Hæd", "Alpha");
    expect(ftsDeletes()).toEqual([]);
  });

  it("deletes a mapped row by rowid, never by a scan of ids", async () => {
    const db = await getLocalLibraryDb();
    await writeTrack(db, "t1", "Hæd", "Alpha");
    mockState.statements = [];
    await writeTrack(db, "t1", "Hæd Again", "Alpha");
    expect(ftsDeletes()).toEqual([
      "DELETE FROM tracks_fts WHERE rowid = ? AND id = ?",
    ]);
    expectOneMappedRowPerTrack();
    expect(match("again")).toEqual(["t1"]);
  });

  it("leaves another track's row alone when a stale rowid points at it", async () => {
    const db = await getLocalLibraryDb();
    for (const [id, title, artist] of TRACKS) {
      await writeTrack(db, id, title, artist);
    }
    // After a downgrade, 1.3.x rewrote t1's FTS row by id without touching
    // `tracks`, and the rowid t1 still records has since gone to t2's row.
    const t2 = raw()
      .prepare("SELECT fts_rowid AS r FROM tracks WHERE id = 't2'")
      .get() as { r: number };
    raw().prepare("UPDATE tracks SET fts_rowid = ? WHERE id = 't1'").run(t2.r);
    // And 1.3.x's own REPLACE nulled t3's.
    raw().exec("UPDATE tracks SET fts_rowid = NULL WHERE id = 't3'");

    await writeTrack(db, "t1", "Hæd", "Alpha");
    await writeTrack(db, "t3", "Third Song", "Gamma");

    expectOneMappedRowPerTrack();
    expect(match("second")).toEqual(["t2"]);
    expect(match("haed")).toEqual(["t1"]);
  });

  it("keeps a tag correction's search row mapped", async () => {
    const db = await getLocalLibraryDb();
    for (const [id, title, artist] of TRACKS) {
      await writeTrack(db, id, title, artist);
    }
    await upsertTrackOverride({
      track_id: "t2",
      title: "Corrected Title",
      artist: null,
      album: null,
      album_artist: null,
      genre: null,
      year: null,
      track_number: null,
      disc_number: null,
      artists_json: null,
      music_brainz_id: null,
      artwork_path: null,
      album_key: null,
      artist_key: null,
      mb_recording_id: null,
      mb_release_id: null,
      mb_release_group_id: null,
      mb_artist_id: null,
    });

    expectOneMappedRowPerTrack();
    expect(match("corrected")).toEqual(["t2"]);
    expect(match("second")).toEqual([]);
  });
});
