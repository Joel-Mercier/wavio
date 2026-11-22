import { isTailnetUrl } from "@/utils/serverUrl";

describe("isTailnetUrl", () => {
  it.each([
    "https://music.ragdoll-taipan.ts.net",
    "https://MUSIC.example.TS.NET:4533/rest/stream?id=1",
    "http://100.64.0.1:4533",
    "http://100.101.102.103",
    "http://100.127.255.254:4533",
    "http://[fd7a:115c:a1e0::1]:4533",
  ])("recognizes %s", (url) => {
    expect(isTailnetUrl(url)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "not a url",
    "http://192.168.1.10:4533",
    "http://100.63.0.1",
    "http://100.128.0.1",
    "https://music.example.com",
    "https://ts.net.example.com",
    "http://[fd00::1]:4533",
    "file:///storage/emulated/0/Music/a.flac",
  ])("rejects %s", (url) => {
    expect(isTailnetUrl(url)).toBe(false);
  });
});
