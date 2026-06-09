import {
  albumKey,
  localAlbumId,
  localArtistId,
  localTrackId,
  normalizeKey,
  parseLocalAlbumId,
  parseLocalArtistId,
  parseLocalTrackId,
} from "@/services/local/keys";

describe("localLibrary keys", () => {
  describe("localTrackId", () => {
    it("is deterministic and prefixed", () => {
      const uri = "file:///storage/emulated/0/Music/song.mp3";
      expect(localTrackId(uri)).toBe(localTrackId(uri));
      expect(localTrackId(uri)).toMatch(/^local-track:/);
    });

    it("differs for different URIs", () => {
      expect(localTrackId("file:///a.mp3")).not.toBe(
        localTrackId("file:///b.mp3"),
      );
    });

    it("round-trips the file URI (so stream URLs resolve with no DB hit)", () => {
      const uri = "file:///storage/emulated/0/Music/A & B/track #1.mp3";
      expect(parseLocalTrackId(localTrackId(uri))).toBe(uri);
    });

    it("returns null for non-track ids", () => {
      expect(parseLocalTrackId("123")).toBeNull();
      expect(parseLocalTrackId(localAlbumId("x"))).toBeNull();
    });
  });

  describe("normalizeKey", () => {
    it("lowercases and collapses whitespace", () => {
      expect(normalizeKey("  The   Wall ")).toBe("the wall");
    });

    it("returns empty string for nullish input", () => {
      expect(normalizeKey(undefined)).toBe("");
      expect(normalizeKey(null)).toBe("");
      expect(normalizeKey("")).toBe("");
    });
  });

  describe("albumKey", () => {
    it("combines album with album-artist", () => {
      expect(albumKey("The Wall", "Pink Floyd", "Pink Floyd")).toBe(
        "the wall pink floyd",
      );
    });

    it("falls back to track artist when no album-artist", () => {
      expect(albumKey("Greatest Hits", null, "Queen")).toBe(
        "greatest hits queen",
      );
    });

    it("separates same-titled albums by different artists", () => {
      expect(albumKey("Greatest Hits", null, "Queen")).not.toBe(
        albumKey("Greatest Hits", null, "ABBA"),
      );
    });
  });

  describe("album / artist id round-trips", () => {
    it("recovers the album key from its id", () => {
      const key = albumKey("Café del Mar", "Various Artists", null);
      expect(parseLocalAlbumId(localAlbumId(key))).toBe(key);
    });

    it("recovers the artist key from its id", () => {
      const key = normalizeKey("Sigur Rós");
      expect(parseLocalArtistId(localArtistId(key))).toBe(key);
    });

    it("returns null when the id is not a local album/artist id", () => {
      expect(parseLocalAlbumId("123")).toBeNull();
      expect(parseLocalArtistId("local-album:foo")).toBeNull();
      expect(parseLocalAlbumId(localArtistId("x"))).toBeNull();
    });
  });
});
