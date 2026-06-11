import {
  albumKey,
  localAlbumId,
  localArtistId,
  localPodcastEpisodeId,
  localTrackId,
  newLocalPodcastChannelId,
  newLocalRadioStationId,
  normalizeKey,
  parseLocalAlbumId,
  parseLocalArtistId,
  parseLocalPodcastEpisodeId,
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

  describe("localPodcastEpisodeId", () => {
    it("round-trips the enclosure URL (so stream/download URLs resolve with no DB hit)", () => {
      const url = "https://cdn.example.com/show/ep 1?token=a&b=c.mp3";
      expect(parseLocalPodcastEpisodeId(localPodcastEpisodeId(url))).toBe(url);
    });

    it("is filesystem-safe (used as a download filename) — no path-unsafe chars", () => {
      const id = localPodcastEpisodeId("https://x/ep.mp3?q=1");
      expect(id).toMatch(/^local-pod-ep-[0-9a-f]+$/);
    });

    it("returns null for non-episode ids", () => {
      expect(parseLocalPodcastEpisodeId("123")).toBeNull();
      expect(
        parseLocalPodcastEpisodeId(localTrackId("file:///a.mp3")),
      ).toBeNull();
    });
  });

  describe("minted ids", () => {
    it("are uniquely prefixed and distinct per call", () => {
      expect(newLocalRadioStationId()).toMatch(/^local-radio:/);
      expect(newLocalPodcastChannelId()).toMatch(/^local-pod-ch:/);
      expect(newLocalRadioStationId()).not.toBe(newLocalRadioStationId());
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
