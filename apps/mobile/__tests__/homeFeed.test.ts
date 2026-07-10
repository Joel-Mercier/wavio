import {
  type BackendCapabilities,
  getCapabilities,
} from "@/services/backend/capabilities";
import type { AlbumID3, Genre } from "@/services/openSubsonic/types";
import {
  buildHomeFeed,
  HOME_SECTION_CATALOG,
  homeSectionSettingKey,
} from "@/utils/homeFeed";

const allCapabilities = Object.fromEntries(
  Object.keys(getCapabilities("navidrome")).map((key) => [key, true]),
) as BackendCapabilities;

const seedAlbums = Array.from({ length: 12 }, (_, i) => ({
  id: `album-${i}`,
  name: `Album ${i}`,
  artistId: `artist-${i % 4}`,
  year: 1960 + (i % 4) * 10,
})) as unknown as AlbumID3[];

const genres = [
  { value: "Rock", songCount: 10, albumCount: 5 },
  { value: "Jazz", songCount: 8, albumCount: 3 },
] as Genre[];

const build = (hiddenSections: readonly string[] = []) =>
  buildHomeFeed({
    seedAlbums,
    genres,
    capabilities: allCapabilities,
    sessionSeed: 42,
    hiddenSections,
  });

describe("buildHomeFeed hidden sections", () => {
  it("returns the full feed when nothing is hidden", () => {
    const ids = build().map((s) => s.id);
    expect(ids).toContain("recentPlays");
    expect(ids).toContain("albumList:recent");
    expect(ids).toContain("nowPlaying");
    expect(ids).toContain("albumList:highest");
    expect(ids.some((id) => id.startsWith("moreFromArtist:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("songsByGenre:"))).toBe(true);
  });

  it("removes exactly the hidden sections and preserves order", () => {
    const baseline = build().map((s) => s.id);
    const filtered = build(["albumList:recent", "nowPlaying"]).map((s) => s.id);
    expect(filtered).toEqual(
      baseline.filter((id) => id !== "albumList:recent" && id !== "nowPlaying"),
    );
  });

  it("hides every instance of a dynamic kind with one key", () => {
    const withoutArtists = build(["moreFromArtist"]).map((s) => s.id);
    expect(withoutArtists.some((id) => id.startsWith("moreFromArtist:"))).toBe(
      false,
    );
    const withoutGenreSongs = build(["songsByGenre"]).map((s) => s.id);
    expect(withoutGenreSongs.some((id) => id.startsWith("songsByGenre:"))).toBe(
      false,
    );
  });

  it("does not perturb dynamic picks when sections are hidden", () => {
    const baseline = build().map((s) => s.id);
    const withHidden = build(["starred", "albumsByDecade"]).map((s) => s.id);
    expect(withHidden).toEqual(
      baseline.filter(
        (id) => id !== "starred" && !id.startsWith("albumsByDecade"),
      ),
    );
  });

  it("ignores unknown keys in the hidden list", () => {
    expect(build(["notARealSection"])).toEqual(build());
  });

  it("maps every produced section to a catalog key", () => {
    const catalogKeys = new Set<string>(
      HOME_SECTION_CATALOG.map((entry) => entry.key),
    );
    for (const section of build()) {
      expect(catalogKeys.has(homeSectionSettingKey(section))).toBe(true);
    }
  });
});
