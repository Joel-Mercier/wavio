import {
  mapBaseItemToAlbum,
  mapBaseItemToArtist,
  mapBaseItemToChild,
  mapJellyfinLyrics,
} from "@/services/jellyfin/mappers";
import type { BaseItemDto } from "@/services/jellyfin/types";

describe("Jellyfin mappers", () => {
  describe("mapBaseItemToChild", () => {
    it("converts RunTimeTicks to seconds", () => {
      const item = {
        Id: "abc",
        Name: "Track",
        RunTimeTicks: 30_000_000,
      } as BaseItemDto;
      expect(mapBaseItemToChild(item).duration).toBe(3);
    });

    it("maps IsFavorite to a starred Date", () => {
      const item = {
        Id: "abc",
        Name: "Track",
        UserData: { IsFavorite: true },
      } as BaseItemDto;
      expect(mapBaseItemToChild(item).starred).toBeInstanceOf(Date);
    });

    it("uses AlbumId as coverArt when present, else Id", () => {
      expect(
        mapBaseItemToChild({
          Id: "song",
          AlbumId: "album",
          Name: "x",
        } as BaseItemDto).coverArt,
      ).toBe("album");
      expect(
        mapBaseItemToChild({ Id: "song", Name: "x" } as BaseItemDto).coverArt,
      ).toBe("song");
    });

    it("falls back to 0 duration when ticks missing", () => {
      expect(
        mapBaseItemToChild({ Id: "x", Name: "y" } as BaseItemDto).duration,
      ).toBe(0);
    });
  });

  describe("mapBaseItemToAlbum", () => {
    it("uses ChildCount or SongCount for songCount", () => {
      expect(
        mapBaseItemToAlbum({
          Id: "1",
          Name: "Alb",
          ChildCount: 10,
        } as BaseItemDto).songCount,
      ).toBe(10);
      expect(
        mapBaseItemToAlbum({
          Id: "1",
          Name: "Alb",
          SongCount: 7,
        } as BaseItemDto).songCount,
      ).toBe(7);
    });
  });

  describe("mapBaseItemToArtist", () => {
    it("maps Name and Id", () => {
      const a = mapBaseItemToArtist({
        Id: "1",
        Name: "Some Artist",
        AlbumCount: 3,
      } as BaseItemDto);
      expect(a).toMatchObject({ id: "1", name: "Some Artist", albumCount: 3 });
    });
  });

  describe("mapJellyfinLyrics", () => {
    it("returns null when no lyrics", () => {
      expect(mapJellyfinLyrics({ Lyrics: [] })).toBeNull();
    });

    it("flags synced when any line has a Start", () => {
      const out = mapJellyfinLyrics({
        Lyrics: [{ Start: 10_000_000, Text: "a" }, { Text: "b" }],
      });
      expect(out?.synced).toBe(true);
      expect(out?.line[0]?.start).toBe(1000);
    });
  });
});
