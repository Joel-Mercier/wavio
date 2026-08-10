// Same shape as __tests__/ssl-trust.test.ts: the native bridge is absent under
// jest, and Platform.OS is forced to "ios" so the loopback-proxy branch (the
// only platform-gated path the resolver depends on) runs.
jest.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (key: string, value: string) => {
        mem.set(key, value);
      },
      getString: (key: string) => mem.get(key) ?? null,
      remove: (key: string) => {
        mem.delete(key);
      },
    },
    zustandStorage: {
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      getItem: (key: string) => mem.get(key) ?? null,
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
  };
});

import { __setProxyInfoForTests } from "@/modules/ssl-trust";
import {
  __resetCustomHeadersCache,
  configuredHeaderNames,
  customHeaderHostMap,
  customHeadersForUrl,
  mergeCustomHeaders,
  requestHeadersForUrl,
  withServerHeaders,
} from "@/services/serverHeaders";
import { type Server, useServersBase } from "@/stores/servers";
import { USER_AGENT } from "@/utils/userAgent";

const HEADERS = { "CF-Access-Client-Id": "id", "CF-Access-Client-Secret": "s" };
// What a native fetcher should send to a header-configured server: ours plus
// theirs. Without the agent Android's loaders fall back to `Dalvik/*`.
const WITH_AGENT = { "User-Agent": USER_AGENT, ...HEADERS };

const server = (over: Partial<Server> = {}): Server => ({
  id: "1",
  name: "Home",
  url: "https://music.example.com",
  current: true,
  type: "navidrome",
  headers: HEADERS,
  ...over,
});

const setServers = (servers: Server[]) => {
  useServersBase.setState({ servers, users: [] }, false);
  __resetCustomHeadersCache();
};

afterEach(() => {
  __setProxyInfoForTests(null);
  setServers([]);
});

describe("customHeadersForUrl", () => {
  it("matches a request URL against the server's host", () => {
    setServers([server()]);
    expect(
      customHeadersForUrl("https://music.example.com/rest/ping?f=json"),
    ).toEqual(HEADERS);
    expect(customHeadersForUrl("https://music.example.com/")).toEqual(HEADERS);
  });

  it("matches the fallback route too", () => {
    setServers([
      server({
        url: "http://192.168.1.10:4533",
        fallbackUrl: "https://music.example.com",
      }),
    ]);
    expect(customHeadersForUrl("http://192.168.1.10:4533/rest/ping")).toEqual(
      HEADERS,
    );
    expect(
      customHeadersForUrl("https://music.example.com/rest/stream?id=1"),
    ).toEqual(HEADERS);
  });

  it("ignores the port when matching, and unrelated hosts entirely", () => {
    setServers([server({ url: "https://music.example.com:8443" })]);
    expect(customHeadersForUrl("https://music.example.com/rest/ping")).toEqual(
      HEADERS,
    );
    expect(customHeadersForUrl("https://musicbrainz.org/ws/2")).toBeUndefined();
    expect(customHeadersForUrl("file:///data/cover.jpg")).toBeUndefined();
    expect(customHeadersForUrl(undefined)).toBeUndefined();
  });

  it("returns nothing for a server without headers or of type local", () => {
    setServers([
      server({ headers: undefined }),
      server({ id: "2", url: "local", type: "local", headers: HEADERS }),
    ]);
    expect(customHeadersForUrl("https://music.example.com/rest/ping")).toBe(
      undefined,
    );
    expect(customHeadersForUrl("local")).toBeUndefined();
  });

  it("resolves a URL already rewritten to the iOS loopback proxy", () => {
    setServers([server()]);
    __setProxyInfoForTests({
      port: 8123,
      upstreams: [{ baseUrl: "https://music.example.com", token: "tok" }],
    });
    expect(
      customHeadersForUrl("http://127.0.0.1:8123/tok/rest/stream?id=1"),
    ).toEqual(HEADERS);
    // An unknown token fronts no saved server.
    expect(
      customHeadersForUrl("http://127.0.0.1:8123/other/rest/stream?id=1"),
    ).toBeUndefined();
  });

  it("keeps a stable object identity until the servers store changes", () => {
    setServers([server()]);
    const first = customHeadersForUrl("https://music.example.com/a");
    const second = customHeadersForUrl("https://music.example.com/b");
    // Identity, not just equality: image sources are rebuilt on every list row,
    // and a fresh object each time would defeat the card memoization.
    expect(first).toBe(second);

    useServersBase.setState(
      { servers: [server({ headers: { "X-Api-Key": "k" } })] },
      false,
    );
    expect(customHeadersForUrl("https://music.example.com/a")).toEqual({
      "X-Api-Key": "k",
    });
  });
});

describe("mergeCustomHeaders", () => {
  it("lets the user's value win over ours", () => {
    setServers([server({ headers: { "User-Agent": "Mine/1.0" } })]);
    expect(
      mergeCustomHeaders("https://music.example.com/rest/stream", {
        "User-Agent": "Wavio/1.0",
        Range: "bytes=0-1",
      }),
    ).toEqual({ "User-Agent": "Mine/1.0", Range: "bytes=0-1" });
  });

  it("returns the base untouched when nothing applies", () => {
    setServers([server()]);
    const base = { "User-Agent": "Wavio/1.0" };
    expect(mergeCustomHeaders("https://elsewhere.example.com", base)).toBe(
      base,
    );
  });
});

describe("requestHeadersForUrl", () => {
  it("adds the app's agent to the server's configured headers", () => {
    setServers([server()]);
    expect(
      requestHeadersForUrl("https://music.example.com/rest/getCoverArt"),
    ).toEqual(WITH_AGENT);
  });

  it("still identifies the app on a server with no configured headers", () => {
    setServers([server({ headers: undefined })]);
    expect(requestHeadersForUrl("https://music.example.com/x")).toEqual({
      "User-Agent": USER_AGENT,
    });
    // And for a URL belonging to no saved server at all.
    expect(requestHeadersForUrl("https://lrclib.net/api/get")).toEqual({
      "User-Agent": USER_AGENT,
    });
    expect(requestHeadersForUrl(undefined)).toEqual({
      "User-Agent": USER_AGENT,
    });
  });

  it("lets the user override the agent", () => {
    setServers([server({ headers: { "User-Agent": "Custom/9" } })]);
    expect(requestHeadersForUrl("https://music.example.com/x")).toEqual({
      "User-Agent": "Custom/9",
    });
  });

  it("keeps a stable identity until the servers store changes", () => {
    setServers([server()]);
    const first = requestHeadersForUrl("https://music.example.com/a");
    expect(requestHeadersForUrl("https://music.example.com/b")).toBe(first);
    // The shared default is stable too, so unconfigured servers don't allocate.
    expect(requestHeadersForUrl("https://elsewhere.example.com/a")).toBe(
      requestHeadersForUrl("https://elsewhere.example.com/b"),
    );
  });
});

describe("withServerHeaders", () => {
  it("attaches headers to a matching image source", () => {
    setServers([server()]);
    expect(
      withServerHeaders({ uri: "https://music.example.com/rest/getCoverArt" }),
    ).toEqual({
      uri: "https://music.example.com/rest/getCoverArt",
      headers: WITH_AGENT,
    });
    expect(withServerHeaders("https://music.example.com/cover.jpg")).toEqual({
      uri: "https://music.example.com/cover.jpg",
      headers: WITH_AGENT,
    });
  });

  it("identifies the app even on an unconfigured remote image", () => {
    // The whole point of this change: expo-image's native loader would
    // otherwise send `Dalvik/*` and get scored as a bot.
    setServers([]);
    expect(withServerHeaders("https://cdn.example.com/art.jpg")).toEqual({
      uri: "https://cdn.example.com/art.jpg",
      headers: { "User-Agent": USER_AGENT },
    });
  });

  it("returns the same wrapper for a repeated URI", () => {
    // Re-wrapping on every render would hand expo-image a new source each time
    // a row re-renders and defeat the card memoization.
    setServers([server()]);
    const uri = "https://music.example.com/rest/getCoverArt?id=1";
    expect(withServerHeaders(uri)).toBe(withServerHeaders(uri));
    expect(withServerHeaders({ uri })).toBe(withServerHeaders({ uri }));
  });

  it("preserves extra source fields rather than reusing the wrapper", () => {
    setServers([server()]);
    const source = { uri: "https://music.example.com/x", width: 64 };
    expect(withServerHeaders(source)).toEqual({
      ...source,
      headers: WITH_AGENT,
    });
  });

  it("leaves everything else identical", () => {
    setServers([server()]);
    const local = { uri: "file:///data/cover.jpg" };
    expect(withServerHeaders(local)).toBe(local);
    const preset = {
      uri: "https://music.example.com/x",
      headers: { A: "b" },
    };
    expect(withServerHeaders(preset)).toBe(preset);
    expect(withServerHeaders(42)).toBe(42);
    expect(withServerHeaders(undefined)).toBe(undefined);
    expect(withServerHeaders("file:///data/cover.jpg")).toBe(
      "file:///data/cover.jpg",
    );
    expect(withServerHeaders("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
    const bundled = [{ uri: "https://music.example.com/x" }];
    expect(withServerHeaders(bundled)).toBe(bundled);
  });
});

describe("configuredHeaderNames / customHeaderHostMap", () => {
  it("lists every configured name lowercased, for Sentry scrubbing", () => {
    setServers([
      server(),
      server({
        id: "2",
        url: "https://b.example.com",
        headers: { "X-Api-Key": "k" },
      }),
    ]);
    expect([...configuredHeaderNames()].sort()).toEqual([
      "cf-access-client-id",
      "cf-access-client-secret",
      "x-api-key",
    ]);
  });

  it("exposes the host map the widget mirrors natively", () => {
    setServers([
      server({
        url: "http://192.168.1.10:4533",
        fallbackUrl: "https://music.example.com",
      }),
    ]);
    expect(customHeaderHostMap()).toEqual({
      "192.168.1.10": HEADERS,
      "music.example.com": HEADERS,
    });
  });
});
