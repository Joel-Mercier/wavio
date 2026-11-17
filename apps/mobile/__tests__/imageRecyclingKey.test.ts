import {
  artworkCacheFileName,
  artworkCacheFileStemOf,
} from "@/utils/artworkCacheKey";
import { imageRecyclingKey, sourceUri } from "@/utils/imageRecyclingKey";

const subsonic = (id: string, extra = "") =>
  `https://music.example.com/rest/getCoverArt?id=${encodeURIComponent(id)}&u=joel&t=abc&s=salt1&v=1.16.1&c=wavio${extra}`;
const jellyfin = (id: string, query = "") =>
  `https://jf.example.com/Items/${id}/Images/Primary${query}`;
const cachedFile = (id: string, savedAt = 1_700_000_000_000) =>
  `file:///data/user/0/com.jmercier.wavio/files/scope/artwork/${artworkCacheFileName(id, savedAt)}`;

describe("sourceUri", () => {
  test.each([
    ["a string", "https://x/a.jpg", "https://x/a.jpg"],
    ["an empty string", "", undefined],
    ["an object", { uri: "file:///a.jpg" }, "file:///a.jpg"],
    ["an empty uri", { uri: "" }, undefined],
    ["a bundled asset", 12, undefined],
    ["an array", [{ uri: "https://x/a.jpg" }], undefined],
    ["nothing", undefined, undefined],
  ])("reads %s", (_, source, expected) => {
    expect(sourceUri(source)).toBe(expected);
  });
});

describe("imageRecyclingKey", () => {
  test("is the same for one Subsonic cover at any size or session", () => {
    const key = imageRecyclingKey({ uri: subsonic("al-1", "&size=300") });
    expect(imageRecyclingKey(subsonic("al-1", "&size=600"))).toBe(key);
    expect(
      imageRecyclingKey({ uri: subsonic("al-1").replace("salt1", "salt2") }),
    ).toBe(key);
  });

  test("ignores Navidrome's updated-at token", () => {
    expect(imageRecyclingKey(subsonic("pl-9_68e67692"))).toBe(
      imageRecyclingKey(subsonic("pl-9_68e6aaaa")),
    );
  });

  test("differs between two covers", () => {
    expect(imageRecyclingKey(subsonic("al-1"))).not.toBe(
      imageRecyclingKey(subsonic("al-2")),
    );
    expect(imageRecyclingKey(jellyfin("a1"))).not.toBe(
      imageRecyclingKey(jellyfin("b2")),
    );
  });

  test("is the same for one Jellyfin cover at any size", () => {
    expect(
      imageRecyclingKey(jellyfin("a1", "?maxHeight=300&maxWidth=300")),
    ).toBe(imageRecyclingKey(jellyfin("a1", "?maxHeight=600&maxWidth=600")));
  });

  test("matches the offline cache's copy of the same cover", () => {
    expect(imageRecyclingKey({ uri: cachedFile("al-1") })).toBe(
      imageRecyclingKey(subsonic("al-1_68e67692", "&size=300")),
    );
    expect(imageRecyclingKey({ uri: cachedFile("a1") })).toBe(
      imageRecyclingKey(jellyfin("a1", "?maxHeight=300")),
    );
    expect(imageRecyclingKey(cachedFile("al-1", 1))).toBe(
      imageRecyclingKey(cachedFile("al-1", 2)),
    );
  });

  test("keeps identifying params on other remote images", () => {
    expect(
      imageRecyclingKey("https://radio.example.com/favicon?station=1&size=64"),
    ).toBe("https://radio.example.com/favicon?station=1");
    expect(
      imageRecyclingKey("https://radio.example.com/favicon?station=1"),
    ).not.toBe(
      imageRecyclingKey("https://radio.example.com/favicon?station=2"),
    );
  });

  test("uses any other uri verbatim", () => {
    expect(imageRecyclingKey("file:///local/cover_1.png")).toBe(
      "file:///local/cover_1.png",
    );
  });

  test("has nothing to key without a uri", () => {
    expect(imageRecyclingKey({ uri: "" })).toBeUndefined();
    expect(imageRecyclingKey(12)).toBeUndefined();
  });
});

describe("artworkCacheFileStemOf", () => {
  test("reads back the stem the cache wrote", () => {
    expect(artworkCacheFileStemOf(cachedFile("al-1"))).toBe("al-1");
    expect(artworkCacheFileStemOf(cachedFile("a/b c"))).toBe("a_b_c");
  });

  test("ignores files outside the artwork cache", () => {
    expect(
      artworkCacheFileStemOf("file:///music/al-1_1700.jpg"),
    ).toBeUndefined();
  });
});
