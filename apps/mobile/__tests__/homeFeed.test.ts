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

// The suite above builds with every capability forced on, so it never exercises
// a real backend matrix. These pin the Subsonic-family song rows, which shipped
// disabled from fd0cb8b7 until the #169 envelope fix made them work again.
const buildWith = (capabilities: BackendCapabilities) =>
  buildHomeFeed({
    seedAlbums,
    genres,
    capabilities,
    sessionSeed: 42,
    hiddenSections: [],
  });

const dynamicPicks = (sections: ReturnType<typeof buildWith>) =>
  sections
    .map((s) => s.id)
    .filter(
      (id) =>
        id.startsWith("moreFromArtist:") ||
        id.startsWith("albumsByDecade:") ||
        id.startsWith("albumsByGenre:"),
    );

describe("buildHomeFeed song sections per backend", () => {
  it.each(["navidrome", "opensubsonic", "jellyfin", "local"] as const)(
    "includes the song rows on %s",
    (serverType) => {
      const ids = buildWith(getCapabilities(serverType)).map((s) => s.id);
      expect(ids).toContain("randomSongs");
      expect(ids.some((id) => id.startsWith("songsByGenre:"))).toBe(true);
    },
  );

  it("omits the song rows when songLists is off", () => {
    const ids = buildWith({
      ...getCapabilities("navidrome"),
      songLists: false,
    }).map((s) => s.id);
    expect(ids).not.toContain("randomSongs");
    expect(ids.some((id) => id.startsWith("songsByGenre:"))).toBe(false);
  });

  // Every RNG draw runs unconditionally before/between the capability gates, so
  // toggling a capability must never reshuffle the other dynamic picks. This is
  // the property that makes changing the matrix safe.
  it("does not perturb dynamic picks when songLists is toggled", () => {
    const on = getCapabilities("navidrome");
    const off = { ...on, songLists: false };
    expect(dynamicPicks(buildWith(off))).toEqual(dynamicPicks(buildWith(on)));
  });
});
