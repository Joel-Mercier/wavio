import { imageCacheKey, imageCacheSession } from "@/utils/imageCacheKey";

const session = imageCacheSession("nd_joel", [
  "http://192.168.1.10:4533/",
  "https://music.example.com",
  "local",
  undefined,
]);

const cover = (base: string, auth: string, extra = "", id = "al-1_68e6") =>
  `${base}/rest/getCoverArt?id=${id}&${auth}&v=1.16.1&c=wavio${extra}`;

describe("imageCacheKey", () => {
  it("ignores the Subsonic session credentials and client params", () => {
    const first = imageCacheKey(
      cover("http://192.168.1.10:4533", "u=joel&t=aaa&s=bbb"),
      session,
    );
    expect(first).toBe("nd_joel/rest/getCoverArt?id=al-1_68e6");
    expect(
      imageCacheKey(
        cover("http://192.168.1.10:4533", "u=joel&t=ccc&s=ddd"),
        session,
      ),
    ).toBe(first);
    expect(
      imageCacheKey(
        cover("http://192.168.1.10:4533", "u=joel&p=enc%3A6869"),
        session,
      ),
    ).toBe(first);
  });

  it("keeps the sign-in salt for a cover id that carries no version", () => {
    const base = "http://192.168.1.10:4533";
    for (const id of ["al-12", "ar-7_0", "ar-7%5F0", "42"]) {
      const before = imageCacheKey(
        cover(base, "u=joel&t=aaa&s=bbb", "", id),
        session,
      );
      expect(before).toContain("s=bbb");
      expect(before).not.toContain("t=aaa");
      expect(
        imageCacheKey(cover(base, "u=joel&t=ccc&s=ddd", "", id), session),
      ).not.toBe(before);
      expect(
        imageCacheKey(cover(base, "u=joel&t=xxx&s=bbb", "", id), session),
      ).toBe(before);
    }
  });

  it("gives both routes of a server the same key", () => {
    expect(
      imageCacheKey(cover("https://music.example.com", "u=a&t=b&s=c"), session),
    ).toBe(
      imageCacheKey(cover("http://192.168.1.10:4533", "u=a&t=x&s=y"), session),
    );
  });

  it("keeps what identifies the image", () => {
    const base = "http://192.168.1.10:4533";
    const small = imageCacheKey(cover(base, "u=a", "&size=300"), session);
    expect(small).toBe("nd_joel/rest/getCoverArt?id=al-1_68e6&size=300");
    expect(imageCacheKey(cover(base, "u=a"), session)).not.toBe(small);
    expect(
      imageCacheKey(
        `${base}/rest/getCoverArt?id=al-1_9999&u=a&size=300`,
        session,
      ),
    ).not.toBe(small);
  });

  it("keeps the whole query outside the Subsonic API", () => {
    expect(
      imageCacheKey(
        "https://music.example.com/Items/abc/Images/Primary?maxHeight=300&maxWidth=300&quality=90",
        session,
      ),
    ).toBe(
      "nd_joel/Items/abc/Images/Primary?maxHeight=300&maxWidth=300&quality=90",
    );
  });

  it("respects path boundaries", () => {
    expect(
      imageCacheKey("https://music.example.community/Items/abc", session),
    ).toBeUndefined();
    const nested = imageCacheSession("sub_joel", [
      "https://music.example.com",
      "https://music.example.com/sub",
    ]);
    expect(
      imageCacheKey(
        "https://music.example.com/sub/rest/getCoverArt?id=1&u=a",
        nested,
      ),
    ).toBe("sub_joel/rest/getCoverArt?id=1");
  });

  it("leaves images from anywhere else alone", () => {
    expect(
      imageCacheKey(
        "https://lastfm.freetls.fastly.net/i/u/300x300/a.png",
        session,
      ),
    ).toBeUndefined();
    expect(
      imageCacheKey(
        "http://127.0.0.1:51234/tok/rest/getCoverArt?id=1",
        session,
      ),
    ).toBeUndefined();
    expect(
      imageCacheKey(cover("https://music.example.com", "u=a"), null),
    ).toBeUndefined();
  });
});
