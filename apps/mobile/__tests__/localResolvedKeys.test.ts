// The grouping keys the `tracks_resolved` view reads are *denormalised* onto
// `tracks` so album and artist lookups can seek an index instead of scanning the
// whole library. That buys speed at the cost of an invariant to hold:
//
//   tracks.resolved_*  ==  COALESCE(override value, scanned value)
//
// Everything below runs the real statement from db.ts against a real SQLite
// engine (node's built-in, not expo-sqlite) rather than a mock, because what's
// under test is the SQL itself.
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(),
}));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import { DatabaseSync } from "node:sqlite";
import { REFRESH_RESOLVED_KEYS_SQL } from "@/services/local/db";

// Trimmed to the columns this invariant touches; the real tables carry many
// more, none of which participate in key resolution.
const SETUP = `
CREATE TABLE tracks (
  id TEXT PRIMARY KEY NOT NULL,
  album TEXT, album_key TEXT, artist_key TEXT, artwork_path TEXT,
  resolved_album_key TEXT, resolved_artist_key TEXT
);
CREATE TABLE track_tag_overrides (
  track_id TEXT PRIMARY KEY NOT NULL,
  album TEXT, album_key TEXT, artist_key TEXT, artwork_path TEXT
);
CREATE TABLE playlists (id TEXT PRIMARY KEY NOT NULL, name TEXT);
CREATE TABLE playlist_tracks (
  playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE INDEX idx_tracks_resolved_album_key ON tracks(resolved_album_key);
CREATE VIEW tracks_resolved AS
SELECT t.id,
  COALESCE(o.album, t.album) AS album,
  COALESCE(o.artwork_path, t.artwork_path) AS artwork_path,
  t.resolved_album_key  AS album_key,
  t.resolved_artist_key AS artist_key
FROM tracks t LEFT JOIN track_tag_overrides o ON o.track_id = t.id;
`;

// The cover subquery from PLAYLIST_AGG_SELECT (repository.ts), verbatim apart
// from the outer columns it doesn't need.
const PLAYLIST_COVER = `
SELECT (SELECT t2.artwork_path
          FROM playlist_tracks pt2
          JOIN tracks_resolved t2 ON t2.id = pt2.track_id
         WHERE pt2.playlist_id = p.id
         ORDER BY pt2.position ASC
         LIMIT 1) AS cover
FROM playlists p WHERE p.id = ?`;

let db: InstanceType<typeof DatabaseSync>;

const scannedTrack = (id: string) => {
  db.prepare(
    `INSERT INTO tracks (id, album, album_key, artist_key,
       resolved_album_key, resolved_artist_key)
     VALUES (?, 'Dumy', 'dumy portished', 'portished',
             'dumy portished', 'portished')`,
  ).run(id);
};

const correct = (id: string, albumKey: string | null) => {
  db.prepare(
    `INSERT OR REPLACE INTO track_tag_overrides
       (track_id, album, album_key, artist_key)
     VALUES (?, 'Dummy', ?, NULL)`,
  ).run(id, albumKey);
};

const refresh = (id: string) => db.prepare(REFRESH_RESOLVED_KEYS_SQL).run(id);

const resolved = (id: string) =>
  db.prepare("SELECT * FROM tracks_resolved WHERE id = ?").get(id) as {
    album: string;
    album_key: string;
    artist_key: string;
  };

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SETUP);
});

afterEach(() => db.close());

describe("resolved grouping keys", () => {
  it("moves a track to the corrected album key", () => {
    scannedTrack("t1");
    correct("t1", "dummy portishead");
    refresh("t1");

    expect(resolved("t1").album_key).toBe("dummy portishead");
    expect(resolved("t1").album).toBe("Dummy");
  });

  it("falls back to the scanned key for a field the match didn't correct", () => {
    // A null override column means "no correction" — the artist key must keep
    // the scanned value rather than becoming null and dropping the track out of
    // its artist grouping entirely.
    scannedTrack("t1");
    correct("t1", "dummy portishead");
    refresh("t1");

    expect(resolved("t1").artist_key).toBe("portished");
  });

  it("restores the scanned key when the correction is cleared", () => {
    scannedTrack("t1");
    correct("t1", "dummy portishead");
    refresh("t1");

    db.prepare("DELETE FROM track_tag_overrides WHERE track_id = ?").run("t1");
    refresh("t1");

    expect(resolved("t1").album_key).toBe("dumy portished");
    expect(resolved("t1").album).toBe("Dumy");
  });

  it("leaves other tracks alone", () => {
    scannedTrack("t1");
    scannedTrack("t2");
    correct("t1", "dummy portishead");
    refresh("t1");

    expect(resolved("t2").album_key).toBe("dumy portished");
  });

  it("keeps a corrected album whole", () => {
    // Every track of the album gets the same key, so the album moves as one
    // rather than splitting between the old and new grouping.
    for (const id of ["t1", "t2", "t3"]) {
      scannedTrack(id);
      correct(id, "dummy portishead");
      refresh(id);
    }
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM tracks_resolved WHERE album_key = ?")
      .get("dummy portishead") as { n: number };

    expect(rows.n).toBe(3);
  });

  it("shows a playlist the corrected cover, not the scanned one", () => {
    // A track whose artwork came from the Cover Art Archive carries it on the
    // correction, not on the scanned row. Reading the base table here left
    // playlists showing the old cover while every other screen showed the new.
    db.prepare(
      "INSERT INTO tracks (id, artwork_path, resolved_album_key) VALUES ('t1', NULL, 'k')",
    ).run();
    db.prepare("INSERT INTO playlists VALUES ('p1', 'Mix')").run();
    db.prepare("INSERT INTO playlist_tracks VALUES ('p1', 't1', 0)").run();

    expect(
      (db.prepare(PLAYLIST_COVER).get("p1") as { cover: string | null }).cover,
    ).toBeNull();

    db.prepare(
      "INSERT INTO track_tag_overrides (track_id, artwork_path) VALUES ('t1', 'file:///mb/cover.jpg')",
    ).run();

    expect(
      (db.prepare(PLAYLIST_COVER).get("p1") as { cover: string | null }).cover,
    ).toBe("file:///mb/cover.jpg");
  });

  it("takes the playlist cover from the first track by position", () => {
    for (const [id, art] of [
      ["t1", "file:///first.jpg"],
      ["t2", "file:///second.jpg"],
    ]) {
      db.prepare(
        "INSERT INTO tracks (id, artwork_path, resolved_album_key) VALUES (?, ?, 'k')",
      ).run(id, art);
    }
    db.prepare("INSERT INTO playlists VALUES ('p1', 'Mix')").run();
    // Inserted out of order to prove the ORDER BY, not insertion order, decides.
    db.prepare("INSERT INTO playlist_tracks VALUES ('p1', 't2', 1)").run();
    db.prepare("INSERT INTO playlist_tracks VALUES ('p1', 't1', 0)").run();

    expect(
      (db.prepare(PLAYLIST_COVER).get("p1") as { cover: string }).cover,
    ).toBe("file:///first.jpg");
  });

  it("seeks an index rather than scanning the library", () => {
    // The whole point of storing the key. A COALESCE in the view makes this a
    // predicate on an expression, which no index can serve — every album screen
    // then scans `tracks` end to end.
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM tracks_resolved WHERE album_key = ?",
      )
      .all("dummy portishead")
      .map((r) => (r as { detail: string }).detail)
      .join(" ");

    expect(plan).toContain("idx_tracks_resolved_album_key");
    // Both sides of the join are seeks; a SCAN anywhere means the key predicate
    // stopped being index-serviceable.
    expect(plan).not.toMatch(/\bSCAN\b/);
  });
});
