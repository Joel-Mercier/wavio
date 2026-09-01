import {
  type BackendCapabilities,
  getCapabilities,
} from "@/services/backend/capabilities";
import type { AlbumID3, Genre } from "@/services/openSubsonic/types";
import {
  availableHomeSections,
  buildHomeFeed,
  HOME_SECTION_CATALOG,
  type HomeSectionAvailability,
  homeSectionSettingKey,
  isHomeSectionAvailable,
  orderHomeSectionEntries,
  reorderHomeSectionKeys,
} from "@/utils/homeFeed";

const allCapabilities = Object.fromEntries(
  Object.keys(getCapabilities("navidrome")).map((key) => [key, true]),
) as BackendCapabilities;

const availability = (listenBrainz = true): HomeSectionAvailability => ({
  capabilities: allCapabilities,
  integrations: { listenBrainz },
});

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

const build = (
  hiddenSections: readonly string[] = [],
  listenBrainz = true,
  order: readonly string[] = [],
) =>
  buildHomeFeed({
    seedAlbums,
    genres,
    availability: availability(listenBrainz),
    sessionSeed: 42,
    hiddenSections,
    order,
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

describe("integration-gated sections", () => {
  it("includes the ListenBrainz section only when it is connected", () => {
    expect(build().map((s) => s.id)).toContain("listenBrainzCreatedForYou");
    expect(build([], false).map((s) => s.id)).not.toContain(
      "listenBrainzCreatedForYou",
    );
  });

  it("can be hidden by the user while connected", () => {
    expect(build(["listenBrainzCreatedForYou"]).map((s) => s.id)).not.toContain(
      "listenBrainzCreatedForYou",
    );
  });

  // The whole reason the availability check lives in the terminal filter rather
  // than at the push site: connecting an account must not reshuffle the seeded
  // artist/genre/decade picks.
  it("does not perturb dynamic picks when the integration is absent", () => {
    const connected = build().map((s) => s.id);
    const disconnected = build([], false).map((s) => s.id);
    expect(disconnected).toEqual(
      connected.filter((id) => id !== "listenBrainzCreatedForYou"),
    );
  });
});

describe("isHomeSectionAvailable", () => {
  const capabilities = {
    ...allCapabilities,
    podcasts: false,
  } as BackendCapabilities;

  it.each([
    ["an ungated entry", {}, true],
    ["a met capability", { capability: "songLists" as const }, true],
    ["an unmet capability", { capability: "podcasts" as const }, false],
    ["a met integration", { integration: "listenBrainz" as const }, true],
    [
      "both gates met",
      {
        capability: "songLists" as const,
        integration: "listenBrainz" as const,
      },
      true,
    ],
    [
      "one of two gates unmet",
      { capability: "podcasts" as const, integration: "listenBrainz" as const },
      false,
    ],
  ])("resolves %s", (_name, entry, expected) => {
    expect(
      isHomeSectionAvailable(entry, {
        capabilities,
        integrations: { listenBrainz: true },
      }),
    ).toBe(expected);
  });

  it("drops an unmet integration from the catalog listing", () => {
    const keys = availableHomeSections(availability(false)).map((e) => e.key);
    expect(keys).not.toContain("listenBrainzCreatedForYou");
    expect(availableHomeSections(availability()).map((e) => e.key)).toContain(
      "listenBrainzCreatedForYou",
    );
  });
});

// The suite above builds with every capability forced on, so it never exercises
// a real backend matrix. These pin the Subsonic-family song rows, which shipped
// disabled from fd0cb8b7 until the #169 envelope fix made them work again.
const buildWith = (capabilities: BackendCapabilities) =>
  buildHomeFeed({
    seedAlbums,
    genres,
    availability: { ...availability(), capabilities },
    sessionSeed: 42,
    hiddenSections: [],
    order: [],
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

const CATALOG_KEYS = HOME_SECTION_CATALOG.map((entry) => entry.key);

describe("buildHomeFeed section order", () => {
  const sorted = (ids: string[]) => [...ids].sort();
  const picks = (ids: string[]) =>
    ids.filter(
      (id) =>
        id.startsWith("moreFromArtist:") ||
        id.startsWith("albumsByDecade:") ||
        id.startsWith("albumsByGenre:"),
    );

  it("leaves the feed untouched when no order is saved", () => {
    expect(build([], true, []).map((s) => s.id)).toEqual(
      build().map((s) => s.id),
    );
  });

  it("puts a section where the order says", () => {
    const order = [
      "internetRadio",
      ...CATALOG_KEYS.filter((key) => key !== "internetRadio"),
    ];
    const ids = build([], true, order).map((s) => s.id);
    expect(ids[0]).toBe("internetRadio");
    expect(sorted(ids)).toEqual(sorted(build().map((s) => s.id)));
  });

  it("groups the repeated dynamic rows at their key's slot, in built order", () => {
    const builtArtistRows = build()
      .map((s) => s.id)
      .filter((id) => id.startsWith("moreFromArtist:"));
    expect(builtArtistRows.length).toBeGreaterThan(1);

    const ids = build([], true, CATALOG_KEYS).map((s) => s.id);
    const first = ids.indexOf(builtArtistRows[0]);
    expect(ids.slice(first, first + builtArtistRows.length)).toEqual(
      builtArtistRows,
    );
  });

  it("orders the whole feed by the saved keys", () => {
    const order = [...CATALOG_KEYS].reverse();
    const keys = build([], true, order).map((section) =>
      homeSectionSettingKey(section),
    );
    // Each key appears as one contiguous block, and the blocks follow `order`.
    const blocks = keys.filter((key, index) => key !== keys[index - 1]);
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(blocks).toEqual(order.filter((key) => blocks.includes(key)));
  });

  it("composes with hidden sections", () => {
    const order = [
      "internetRadio",
      ...CATALOG_KEYS.filter((key) => key !== "internetRadio"),
    ];
    const ids = build(["starred", "podcasts"], true, order).map((s) => s.id);
    expect(ids[0]).toBe("internetRadio");
    expect(ids).not.toContain("starred");
    expect(ids).not.toContain("podcasts");
  });

  it("does not perturb dynamic picks when the order changes", () => {
    const ordered = build([], true, [...CATALOG_KEYS].reverse()).map(
      (s) => s.id,
    );
    expect(sorted(picks(ordered))).toEqual(
      sorted(picks(build().map((s) => s.id))),
    );
  });

  it("ignores unknown keys and still renders sections the order omits", () => {
    const ids = build([], true, ["notARealSection", "starred"]).map(
      (s) => s.id,
    );
    expect(ids[0]).toBe("starred");
    expect(sorted(ids)).toEqual(sorted(build().map((s) => s.id)));
  });
});

describe("orderHomeSectionEntries", () => {
  const entries = availableHomeSections(availability());

  it("returns the catalog order when nothing is saved", () => {
    expect(orderHomeSectionEntries(entries, []).map((e) => e.key)).toEqual(
      entries.map((e) => e.key),
    );
  });

  it("sorts by the saved order and appends unknown keys in catalog order", () => {
    const keys = orderHomeSectionEntries(entries, ["starred", "podcasts"]).map(
      (e) => e.key,
    );
    expect(keys.slice(0, 2)).toEqual(["starred", "podcasts"]);
    expect(keys.slice(2)).toEqual(
      entries
        .map((e) => e.key)
        .filter((key) => key !== "starred" && key !== "podcasts"),
    );
  });
});

describe("reorderHomeSectionKeys", () => {
  const visible = ["a", "b", "c", "d"];

  it("seeds from the catalog when no order is stored", () => {
    const next = reorderHomeSectionKeys([], CATALOG_KEYS, 3, 0);
    expect(next[0]).toBe(CATALOG_KEYS[3]);
    expect([...next].sort()).toEqual([...CATALOG_KEYS].sort());
  });

  it("moves a key down", () => {
    expect(reorderHomeSectionKeys(visible, visible, 0, 2)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("moves a key up", () => {
    expect(reorderHomeSectionKeys(visible, visible, 2, 0)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("moves a key to the end", () => {
    expect(reorderHomeSectionKeys(visible, visible, 0, 3)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("is a no-op for an out-of-range index", () => {
    expect(reorderHomeSectionKeys(visible, visible, 9, 0)).toEqual(visible);
  });

  it("leaves an unset order empty for an out-of-range index", () => {
    expect(reorderHomeSectionKeys([], visible, 9, 0)).toEqual([]);
  });

  it("keeps keys unavailable on this server pinned to their neighbour", () => {
    // "x" is stored but not shown here; it must stay right after "b".
    const stored = ["a", "b", "x", "c", "d"];
    expect(reorderHomeSectionKeys(stored, visible, 3, 0)).toEqual([
      "d",
      "a",
      "b",
      "x",
      "c",
    ]);
  });

  it("adopts visible keys the stored order has never seen", () => {
    expect(reorderHomeSectionKeys(["a", "b"], visible, 0, 1)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });
});
