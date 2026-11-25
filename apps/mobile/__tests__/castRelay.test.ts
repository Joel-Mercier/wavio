const mockStorage = new Map<string, string>();
jest.mock("@/config/storage", () => ({
  getNoBackupStorage: () => ({
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockStorage.set(key, value),
    remove: (key: string) => mockStorage.delete(key),
  }),
}));

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

let mockSessionCounter = 0;
let mockLastToken = "";
const mockNative = {
  startSession: jest.fn((_host: string, port: number, token: string | null) => {
    mockLastToken = token ?? String(++mockSessionCounter).padStart(32, "0");
    return { host: "192.168.1.80", port: port || 41000, token: mockLastToken };
  }),
  register: jest.fn(
    (id: string, _source: unknown, ext: string) =>
      `http://192.168.1.80:41000/${mockLastToken}/${encodeURIComponent(id)}.${ext}`,
  ),
  requestCount: jest.fn(() => 0),
  sessionRequestCount: jest.fn(() => 0),
  setServing: jest.fn(),
  setRequestEvents: jest.fn(),
  endSession: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
jest.mock("@/modules/cast-server", () => ({
  __esModule: true,
  default: mockNative,
}));

const mockTrusted = { value: false };
jest.mock("@/modules/ssl-trust", () => ({
  hostnameFromUrl: (url: string) => {
    const match = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(url.trim());
    return match ? match[1].toLowerCase() : "";
  },
  isCertificateTrusted: jest.fn(async () => mockTrusted.value),
}));

const mockHeaders: Record<string, Record<string, string>> = {};
let mockHeadersListener: (() => void) | null = null;
jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: (url: string) => {
    const origin = /^https?:\/\/[^/]+/i.exec(url)?.[0] ?? "";
    return { "User-Agent": "Wavio", ...(mockHeaders[origin] ?? {}) };
  },
  subscribeCustomHeaders: (listener: () => void) => {
    mockHeadersListener = listener;
    return () => {};
  },
}));

jest.mock("@/services/upnpTrace", () => ({
  isUpnpTracing: () => false,
  upnpTrace: jest.fn(),
}));

const mockAuth = { serverType: "smb" as string };
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

const mockDirect: Record<string, string | undefined> = {};
jest.mock("@/services/playback/castContentUrl", () => ({
  castContentUrl: (track: { id: string }) => mockDirect[track.id],
}));

jest.mock("@/services/playback/castMime", () => ({
  castMime: () => "audio/flac",
  hostedElsewhere: (track: { source?: string; isRadio?: boolean }) =>
    !!track.isRadio || track.source === "audiobook",
}));

let mockRemoteListener: (() => void) | null = null;
const mockSnapshot = { playing: false, buffering: false };
jest.mock("@/services/playback/remoteTarget", () => ({
  activeRemoteTarget: () => ({ readSnapshot: () => mockSnapshot }),
  subscribeRemoteChange: (listener: () => void) => {
    mockRemoteListener = listener;
    return () => {};
  },
}));

import { localTrackId } from "@/services/local/keys";
import type { QueueTrack } from "@/stores/queue";

// Required, not imported: the module wires itself to the native module and the
// remote-target registry when it loads, which has to happen after the mocks
// above exist (imports are hoisted above them).
const {
  __resetCastRelay,
  endCastRelaySession,
  redactRelayUrl,
  relayNeverReached,
  resolveCastMedia,
  resumeCastRelay,
} = require("@/services/castRelay") as typeof import("@/services/castRelay");

const track = (id: string, extra: Partial<QueueTrack> = {}): QueueTrack =>
  ({ id, url: "", title: "Song", suffix: "flac", ...extra }) as QueueTrack;

function resolve(
  t: QueueTrack,
  host: string | null = "192.168.1.50",
  owner: "cast" | "upnp" = "upnp",
) {
  return resolveCastMedia(t, host, owner);
}

// Lets the background certificate lookups settle.
const flush = () => new Promise((done) => setImmediate(done));

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  mockAuth.serverType = "smb";
  mockTrusted.value = false;
  for (const key of Object.keys(mockHeaders)) delete mockHeaders[key];
  for (const key of Object.keys(mockDirect)) delete mockDirect[key];
  mockSnapshot.playing = false;
  mockSnapshot.buffering = false;
  __resetCastRelay();
});

describe("what is relayed", () => {
  it("serves a track off an SMB share through its loopback bridge", async () => {
    const id = localTrackId("smb:/Music/a.flac");
    mockDirect[id] = "http://127.0.0.1:39000/sharetoken/Music/a.flac";
    const media = await resolve(track(id));
    expect(media?.relayed).toBe(true);
    expect(mockNative.register).toHaveBeenCalledWith(
      id,
      {
        kind: "upstream",
        url: "http://127.0.0.1:39000/sharetoken/Music/a.flac",
        headers: { "User-Agent": "Wavio" },
      },
      "flac",
      "audio/flac",
    );
  });

  it("serves a file on this phone straight from storage", async () => {
    mockAuth.serverType = "local";
    const uri = "content://com.android.externalstorage.documents/tree/x/a.flac";
    const id = localTrackId(uri);
    mockDirect[id] = uri;
    await resolve(track(id));
    expect(mockNative.register).toHaveBeenCalledWith(
      id,
      { kind: "local", uri },
      "flac",
      "audio/flac",
    );
  });

  it("carries a WebDAV share's credentials, which a receiver couldn't send", async () => {
    mockAuth.serverType = "webdav";
    const id = localTrackId("webdav:/Music/a.flac");
    mockDirect[id] = "https://nas.local/dav/Music/a.flac";
    mockHeaders["https://nas.local"] = { Authorization: "Basic abc" };
    await resolve(track(id));
    expect(mockNative.register.mock.calls[0][1]).toEqual({
      kind: "upstream",
      url: "https://nas.local/dav/Music/a.flac",
      headers: { "User-Agent": "Wavio", Authorization: "Basic abc" },
    });
  });

  it("hands a plain server's stream over directly", async () => {
    mockAuth.serverType = "navidrome";
    mockDirect.t1 = "http://192.168.1.10:4533/rest/stream?id=t1&u=a&t=b&s=c";
    const media = await resolve(track("t1"));
    expect(media).toEqual({
      url: mockDirect.t1,
      mime: "audio/flac",
      artworkUrl: undefined,
      relayed: false,
    });
    expect(mockNative.startSession).not.toHaveBeenCalled();
  });

  it("relays a server behind headers or on a tailnet address", () => {
    mockAuth.serverType = "navidrome";
    mockDirect.a = "https://music.example.com/rest/stream?id=a";
    mockHeaders["https://music.example.com"] = { "CF-Access-Client-Id": "x" };
    mockDirect.b = "http://box.tail1234.ts.net:4533/rest/stream?id=b";
    expect(resolve(track("a"))?.relayed).toBe(true);
    expect(resolve(track("b"))?.relayed).toBe(true);
  });

  it("relays a self-signed server once its certificate is known, without waiting", async () => {
    mockAuth.serverType = "navidrome";
    mockTrusted.value = true;
    mockDirect.c = "https://192.168.1.10:8443/rest/stream?id=c";
    // Never asked about: treated as public at once rather than waited on, since
    // a renderer's poll about the outgoing track must find the new load in place.
    expect(resolve(track("c"))?.relayed).toBe(false);
    await flush();
    expect(resolve(track("c"))?.relayed).toBe(true);
  });

  it("never relays an audiobook or a radio stream for an integration's bearer", () => {
    mockAuth.serverType = "navidrome";
    mockDirect.book = "https://abs.example.com/public/session/s1/track/1";
    mockHeaders["https://abs.example.com"] = { Authorization: "Bearer abs" };
    const media = resolve(track("book", { source: "audiobook" }));
    expect(media).toMatchObject({ url: mockDirect.book, relayed: false });
    expect(mockNative.startSession).not.toHaveBeenCalled();
  });

  it("refuses a credentialed or library track it can't relay rather than handing it over bare", () => {
    mockAuth.serverType = "webdav";
    const id = localTrackId("webdav:/Music/a.flac");
    mockDirect[id] = "https://nas.local/dav/Music/a.flac";
    mockHeaders["https://nas.local"] = { Authorization: "Basic abc" };
    // No receiver address: nothing to relay through.
    expect(resolve(track(id), null)).toBeNull();
    mockAuth.serverType = "navidrome";
    mockDirect.a = "https://music.example.com/rest/stream?id=a";
    mockHeaders["https://music.example.com"] = { "CF-Access-Client-Id": "x" };
    expect(resolve(track("a"), null)).toBeNull();
  });

  it("never hands a receiver a file or a loopback address it can't reach", async () => {
    const id = localTrackId("smb:/Music/a.flac");
    mockDirect[id] = "http://127.0.0.1:39000/sharetoken/Music/a.flac";
    // No receiver address, so nothing to relay to.
    expect(await resolve(track(id), null)).toBeNull();
    mockAuth.serverType = "local";
    const file = localTrackId("file:///sdcard/Music/a.flac");
    mockDirect[file] = "file:///sdcard/Music/a.flac";
    expect(await resolve(track(file), null)).toBeNull();
  });

  it("serves a library cover from the phone and passes a remote one through", async () => {
    const id = localTrackId("smb:/Music/a.flac");
    mockDirect[id] = "http://127.0.0.1:39000/s/a.flac";
    const media = await resolve(
      track(id, { artwork: "file:///data/artwork/abc.jpg" }),
    );
    expect(media?.artworkUrl).toMatch(/^http:\/\/192\.168\.1\.80/);
    expect(mockNative.register).toHaveBeenCalledWith(
      "art:file:///data/artwork/abc.jpg",
      { kind: "local", uri: "file:///data/artwork/abc.jpg" },
      "jpg",
      "image/jpeg",
    );
  });
});

describe("the session", () => {
  const id = localTrackId("smb:/Music/a.flac");
  beforeEach(() => {
    mockDirect[id] = "http://127.0.0.1:39000/s/a.flac";
  });

  it("keeps one session per receiver and opens a new one for the next", async () => {
    await resolve(track(id), "192.168.1.50");
    await resolve(track(id), "192.168.1.50");
    expect(mockNative.startSession).toHaveBeenCalledTimes(1);
    await resolve(track(id), "192.168.1.60");
    expect(mockNative.endSession).toHaveBeenCalledTimes(1);
    expect(mockNative.startSession).toHaveBeenCalledTimes(2);
    // A new receiver gets a new token: a URL handed to one device never
    // works for the next.
    expect(mockNative.startSession.mock.calls[1][2]).toBeNull();
  });

  it("is ended only by the output that owns it", async () => {
    await resolve(track(id), "192.168.1.50", "upnp");
    endCastRelaySession("cast");
    expect(mockNative.endSession).not.toHaveBeenCalled();
    endCastRelaySession("upnp");
    expect(mockNative.endSession).toHaveBeenCalledTimes(1);
  });

  it("resumes with the same token and port after a restart", async () => {
    await resolve(track(id), "192.168.1.50");
    const first = mockNative.startSession.mock.results[0].value;
    __resetCastRelay();
    await resumeCastRelay(track(id), "192.168.1.50", "upnp");
    expect(mockNative.startSession).toHaveBeenLastCalledWith(
      "192.168.1.50",
      first.port,
      first.token,
    );
    expect(mockNative.register).toHaveBeenLastCalledWith(
      id,
      expect.anything(),
      "flac",
      "audio/flac",
    );
  });

  it("doesn't resume someone else's receiver with the old token", async () => {
    await resolve(track(id), "192.168.1.50");
    __resetCastRelay();
    await resumeCastRelay(track(id), "192.168.1.99", "upnp");
    expect(mockNative.startSession).toHaveBeenLastCalledWith(
      "192.168.1.99",
      expect.any(Number),
      null,
    );
  });

  it("keeps the phone serving only while the receiver plays", async () => {
    await resolve(track(id));
    mockSnapshot.playing = true;
    mockRemoteListener?.();
    mockRemoteListener?.();
    expect(mockNative.setServing).toHaveBeenLastCalledWith(true);
    expect(
      mockNative.setServing.mock.calls.filter(([on]) => on === true),
    ).toHaveLength(1);
    mockSnapshot.playing = false;
    mockRemoteListener?.();
    expect(mockNative.setServing).toHaveBeenLastCalledWith(false);
  });

  it("tells a receiver that never fetched from one that refused", async () => {
    const media = await resolve(track(id));
    expect(relayNeverReached(media?.url)).toBe(true);
    mockNative.requestCount.mockReturnValueOnce(3);
    expect(relayNeverReached(media?.url)).toBe(false);
    // Nothing fetched for this track, but earlier ones were: the receiver can
    // reach the phone and refused this one for another reason.
    mockNative.sessionRequestCount.mockReturnValueOnce(12);
    expect(relayNeverReached(media?.url)).toBe(false);
    expect(relayNeverReached("http://192.168.1.10/rest/stream?id=x")).toBe(
      false,
    );
  });

  it("sends fresh headers to every upstream it serves when they change", () => {
    mockAuth.serverType = "navidrome";
    mockDirect.a = "https://music.example.com/rest/stream?id=a";
    mockHeaders["https://music.example.com"] = { Authorization: "Bearer old" };
    resolve(track("a"));
    mockHeaders["https://music.example.com"] = { Authorization: "Bearer new" };
    mockHeadersListener?.();
    expect(mockNative.register).toHaveBeenLastCalledWith(
      "a",
      {
        kind: "upstream",
        url: mockDirect.a,
        headers: { "User-Agent": "Wavio", Authorization: "Bearer new" },
      },
      "flac",
      "audio/flac",
    );
  });

  it("hides the session token in logs", () => {
    expect(
      redactRelayUrl(
        `http://192.168.1.80:41000/${"a".repeat(32)}/${"b".repeat(32)}.flac?id=x`,
      ),
    ).toBe(`http://192.168.1.80:41000/…/${"b".repeat(32)}.flac`);
  });
});
