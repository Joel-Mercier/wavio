import {
  artFallbackFor,
  encodeMediaId,
  type MediaId,
  parseMediaId,
} from "@/services/carAuto/mediaId";

describe("car media ids", () => {
  const roundTrips: MediaId[] = [
    { kind: "root" },
    { kind: "section", key: "downloads" },
    { kind: "row", key: "leastPlayed" },
    { kind: "album", id: "al-1" },
    { kind: "playlist", id: "pl:with:colons" },
    { kind: "artist", id: "ar-1" },
    { kind: "genre", name: "Drum & Bass | Jungle: 90s" },
    { kind: "favorites", of: "songs" },
    { kind: "downloads", of: "albums" },
    { kind: "offlineCollection", id: "album-al-1" },
    { kind: "radioStation", id: "st-9" },
    { kind: "mix", mix: "shuffleAll" },
    { kind: "mix", mix: "genre", arg: "Hip-Hop: Old School" },
    { kind: "podcast", source: "taddy", id: "uuid-1" },
    { kind: "book", id: "li_1" },
    { kind: "search", query: "a|b:c%d" },
    { kind: "track", parent: "genre:Rock%20%7C%20Pop", id: "song|with|pipes" },
    { kind: "episode", parent: "podcast:server:ch-1", id: "ep-1" },
  ];

  it.each(roundTrips)("round-trips %o", (id) => {
    expect(parseMediaId(encodeMediaId(id))).toEqual(id);
  });

  it("keeps a track's parent intact when the parent holds free text", () => {
    const parent = encodeMediaId({ kind: "search", query: "a|b" });
    const raw = encodeMediaId({ kind: "track", parent, id: "s1" });

    expect(parseMediaId(raw)).toEqual({ kind: "track", parent, id: "s1" });
  });

  it("rejects unknown or incomplete ids", () => {
    expect(parseMediaId("tab:home")).toBeNull();
    expect(parseMediaId("section:nope")).toBeNull();
    expect(parseMediaId("track|only-parent")).toBeNull();
    expect(parseMediaId("podcast:other:1")).toBeNull();
    expect(parseMediaId("album:")).toBeNull();
  });
});

// Mirrors the in-app placeholder each kind of item draws without a cover.
describe("car cover fallbacks", () => {
  it.each([
    [{ kind: "album", id: "a" }, "album"],
    [{ kind: "playlist", id: "p" }, "playlist"],
    [{ kind: "artist", id: "r" }, "artist"],
    [{ kind: "offlineCollection", id: "album-a" }, "album"],
    [{ kind: "offlineCollection", id: "playlist-p" }, "playlist"],
    [{ kind: "radioStation", id: "s" }, "radio"],
    [{ kind: "mix", mix: "artist", arg: "r" }, "artist"],
    [{ kind: "mix", mix: "genre", arg: "Rock" }, "playlist"],
    [{ kind: "podcast", source: "taddy", id: "x" }, "podcast"],
    [{ kind: "episode", parent: "podcast:taddy:x", id: "e" }, "podcast"],
    [{ kind: "book", id: "b" }, "audiobook"],
    [{ kind: "track", parent: "album:a", id: "t" }, "track"],
  ] as [MediaId, string][])("%o draws %s", (id, fallback) => {
    expect(artFallbackFor(encodeMediaId(id))).toBe(fallback);
  });

  it("leaves sections and genres to their icons", () => {
    expect(
      artFallbackFor(encodeMediaId({ kind: "section", key: "home" })),
    ).toBe(undefined);
    expect(artFallbackFor(encodeMediaId({ kind: "genre", name: "Rock" }))).toBe(
      undefined,
    );
  });
});
