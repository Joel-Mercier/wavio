import { sameStreamUri } from "@/services/playback/streamUri";

describe("sameStreamUri", () => {
  const ours =
    "http://server/rest/stream?id=t1&u=x&t=abc&s=salt1&v=1.16&c=wavio";

  it("matches the same track under a different auth salt", () => {
    expect(
      sameStreamUri(ours, "http://server/rest/stream?id=t1&u=x&t=def&s=salt2"),
    ).toBe(true);
  });

  it("tells two tracks apart", () => {
    expect(
      sameStreamUri(ours, "http://server/rest/stream?id=t2&u=x&t=abc&s=salt1"),
    ).toBe(false);
  });

  it("reads a URI the renderer handed back still escaped", () => {
    expect(
      sameStreamUri(ours, "http://server/rest/stream?id=t1&amp;u=x&amp;t=abc"),
    ).toBe(true);
  });

  it("sees through a vendor scheme prefix", () => {
    expect(
      sameStreamUri(ours, "x-sonos-http:http://server/rest/stream?id=t1&u=x"),
    ).toBe(true);
  });

  it("compares host and path for streams without a track id", () => {
    expect(
      sameStreamUri(
        "https://radio.example/live.mp3",
        "https://radio.example/live.mp3/",
      ),
    ).toBe(true);
    expect(
      sameStreamUri(
        "https://radio.example/live.mp3",
        "https://radio.example/other.mp3",
      ),
    ).toBe(false);
  });

  it("is never fooled by nothing", () => {
    expect(sameStreamUri("", ours)).toBe(false);
    expect(sameStreamUri(ours, null)).toBe(false);
    expect(sameStreamUri("not a url", "not a url")).toBe(false);
  });
});
