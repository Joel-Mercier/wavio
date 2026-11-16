// Runs the real playlist query against node's built-in SQLite, since the SQL
// itself is what's under test.
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(),
}));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

const mockDb: { current: InstanceType<typeof DatabaseSync> | null } = {
  current: null,
};
jest.mock("@/services/local/db", () => ({
  ...jest.requireActual("@/services/local/db"),
  getLocalLibraryDb: async () => ({
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      mockDb.current?.prepare(sql).all(...(params as never[])),
  }),
}));

import { DatabaseSync } from "node:sqlite";
import { queryPlaylistsByArtist } from "@/services/local/repository";

const SETUP = `
CREATE TABLE tracks (
  id TEXT PRIMARY KEY NOT NULL, duration_ms INTEGER, artwork_path TEXT,
  resolved_artist_key TEXT
);
CREATE VIEW tracks_resolved AS SELECT id, artwork_path FROM tracks;
CREATE TABLE playlists (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, comment TEXT,
  created_at INTEGER NOT NULL, changed_at INTEGER NOT NULL
);
CREATE TABLE playlist_tracks (
  playlist_id TEXT NOT NULL, position INTEGER NOT NULL, track_id TEXT NOT NULL,
  PRIMARY KEY (playlist_id, position)
);
`;

const track = (id: string, artistKey: string) =>
  mockDb.current
    ?.prepare(
      "INSERT INTO tracks (id, duration_ms, resolved_artist_key) VALUES (?, 1000, ?)",
    )
    .run(id, artistKey);

const playlist = (id: string, name: string, trackIds: string[]) => {
  mockDb.current
    ?.prepare(
      "INSERT INTO playlists (id, name, created_at, changed_at) VALUES (?, ?, 0, 0)",
    )
    .run(id, name);
  trackIds.forEach((trackId, position) => {
    mockDb.current
      ?.prepare(
        "INSERT INTO playlist_tracks (playlist_id, position, track_id) VALUES (?, ?, ?)",
      )
      .run(id, position, trackId);
  });
};

beforeEach(() => {
  mockDb.current = new DatabaseSync(":memory:");
  mockDb.current.exec(SETUP);
  track("r1", "radiohead");
  track("r2", "radiohead");
  track("b1", "bjork");
});

afterEach(() => mockDb.current?.close());

it("lists playlists holding the artist, most of their tracks first", async () => {
  playlist("one", "Zebra", ["r1", "b1"]);
  playlist("two", "Alpha", ["r1", "r2"]);
  playlist("none", "Bjork only", ["b1"]);
  playlist("tie", "Beta", ["r2"]);

  const rows = await queryPlaylistsByArtist("radiohead");

  expect(rows.map((row) => row.id)).toEqual(["two", "tie", "one"]);
  expect(rows[2]).toMatchObject({ song_count: 2, duration_ms: 2000 });
});

it("ignores rows whose track is no longer indexed", async () => {
  playlist("dangling", "Gone", ["missing"]);

  expect(await queryPlaylistsByArtist("radiohead")).toEqual([]);
});
