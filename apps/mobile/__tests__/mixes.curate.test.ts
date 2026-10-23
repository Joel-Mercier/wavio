import {
  adaptiveArtistCap,
  curateMix,
  mixArtistKey,
} from "@/services/mixes/curate";
import type { Child } from "@/services/openSubsonic/types";
import { mulberry32 } from "@/utils/shuffle";

let nextId = 0;
const track = (artist: string, overrides: Partial<Child> = {}): Child =>
  ({
    id: `t${nextId++}`,
    title: `Song ${nextId}`,
    artist,
    artists: [{ id: `ar-${artist}`, name: artist }],
    album: `${artist} album`,
    albumId: `al-${artist}-${nextId % 4}`,
    duration: 200,
    isDir: false,
    ...overrides,
  }) as Child;

const many = (artist: string, count: number) =>
  Array.from({ length: count }, () => track(artist));

const options = {
  target: 50,
  maxPerArtist: 3,
  maxPerAlbum: 10,
  minSpacing: 3,
};

const countBy = (tracks: Child[]) => {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const key = mixArtistKey(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

beforeEach(() => {
  nextId = 0;
});

describe("curateMix", () => {
  it("drops duplicate ids and the same song released twice", () => {
    const original = track("A", { title: "Hey Jude" });
    const reissue = track("A", {
      title: "Hey Jude (2015 Remaster)",
      albumId: "al-best-of",
    });
    const mix = curateMix(
      [original, { ...original }, reissue, track("A", { title: "Other" })],
      options,
      mulberry32(1),
    );
    expect(mix).toHaveLength(2);
    expect(mix.filter((t) => t.title.startsWith("Hey Jude"))).toHaveLength(1);
  });

  it("filters out tracks shorter than a minute", () => {
    const mix = curateMix(
      [track("A", { duration: 25 }), track("B"), track("C", { duration: 0 })],
      options,
      mulberry32(1),
    );
    expect(mix.map((t) => t.artist).sort()).toEqual(["B", "C"]);
  });

  it("caps each artist and album", () => {
    const pool = [
      ...many("A", 20),
      ...many("B", 20),
      ...Array.from({ length: 10 }, () => track("C", { albumId: "al-c" })),
    ];
    const mix = curateMix(
      pool,
      { ...options, maxPerArtist: 5, maxPerAlbum: 2 },
      mulberry32(7),
    );
    const counts = countBy(mix);
    expect(counts.get("ar-A")).toBeLessThanOrEqual(5);
    expect(counts.get("ar-B")).toBeLessThanOrEqual(5);
    expect(counts.get("ar-C")).toBe(2);
  });

  it("honours per-artist cap overrides", () => {
    const mix = curateMix(
      [...many("Seed", 30), ...many("B", 30)],
      { ...options, artistCaps: new Map([["ar-Seed", 10]]) },
      mulberry32(3),
    );
    const counts = countBy(mix);
    expect(counts.get("ar-Seed")).toBe(10);
    expect(counts.get("ar-B")).toBe(3);
  });

  it("goes wide before deep when the target is reached early", () => {
    const pool = ["A", "B", "C", "D", "E"].flatMap((a) => many(a, 10));
    const mix = curateMix(
      pool,
      { ...options, target: 10, maxPerArtist: 5 },
      mulberry32(5),
    );
    expect([...countBy(mix).values()]).toEqual([2, 2, 2, 2, 2]);
  });

  it("keeps the same artist apart when the pool allows it", () => {
    const pool = ["A", "B", "C", "D", "E", "F"].flatMap((a) => many(a, 3));
    const mix = curateMix(pool, options, mulberry32(11));
    expect(mix).toHaveLength(18);
    for (let i = 0; i < mix.length; i++) {
      const window = mix.slice(Math.max(0, i - 3), i).map(mixArtistKey);
      expect(window).not.toContain(mixArtistKey(mix[i]));
    }
  });

  it("relaxes the spacing rather than dropping tracks", () => {
    const mix = curateMix(
      [...many("A", 3), track("B")],
      options,
      mulberry32(2),
    );
    expect(mix).toHaveLength(4);
  });

  it("spreads a large seed share instead of clustering it", () => {
    const pool = [
      ...many("Seed", 10),
      ...["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"].flatMap(
        (a) => many(a, 3),
      ),
    ];
    const mix = curateMix(
      pool,
      { ...options, artistCaps: new Map([["ar-Seed", 10]]) },
      mulberry32(9),
    );
    for (let i = 1; i < mix.length; i++) {
      const sameAsPrevious =
        mixArtistKey(mix[i]) === "ar-Seed" &&
        mixArtistKey(mix[i - 1]) === "ar-Seed";
      expect(sameAsPrevious).toBe(false);
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    const pool = ["A", "B", "C", "D"].flatMap((a) => many(a, 10));
    const ids = (seed: number) =>
      curateMix(pool, options, mulberry32(seed)).map((t) => t.id);
    expect(ids(42)).toEqual(ids(42));
    expect(ids(42)).not.toEqual(ids(43));
  });

  it("returns fewer than the target rather than padding", () => {
    const mix = curateMix(many("A", 10), options, mulberry32(1));
    expect(mix).toHaveLength(3);
  });

  it("counts compilation tracks against their own artist, not the album artist", () => {
    const pool = ["A", "B", "C", "D"].map((a) =>
      track(a, { artistId: "ar-various", albumId: "al-va" }),
    );
    const mix = curateMix(
      pool,
      { ...options, maxPerArtist: 1, maxPerAlbum: 10 },
      mulberry32(1),
    );
    expect(mix).toHaveLength(4);
  });

  it("keys id-less artists on their full name", () => {
    const named = (artist: string) => track(artist, { artists: undefined });
    expect(mixArtistKey(named("Mono"))).toBe("name:mono");
    expect(mixArtistKey(named("The Band"))).not.toBe(
      mixArtistKey(named("Band")),
    );
    const pool = Array.from({ length: 5 }, () => named("Mono"));
    const mix = curateMix(pool, { ...options, maxPerArtist: 2 }, mulberry32(1));
    expect(mix).toHaveLength(2);
  });
});

describe("adaptiveArtistCap", () => {
  it("stays at the floor for a varied pool", () => {
    const pool = Array.from({ length: 40 }, (_, i) => track(`A${i}`));
    expect(adaptiveArtistCap(pool, 50, { floor: 2, ceiling: 5 })).toBe(2);
  });

  it("loosens for a pool with few artists, up to the ceiling", () => {
    expect(
      adaptiveArtistCap([...many("A", 5), ...many("B", 5)], 50, {
        floor: 2,
        ceiling: 5,
      }),
    ).toBe(5);
    expect(
      adaptiveArtistCap(
        ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"].map(
          (a) => track(a),
        ),
        50,
        { floor: 2, ceiling: 5 },
      ),
    ).toBe(4);
  });
});
