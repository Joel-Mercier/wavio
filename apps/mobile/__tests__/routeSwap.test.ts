const mockAuthState = {
  serverId: "srv-1",
  url: "http://192.168.1.10:4533",
  serverType: "navidrome",
};
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuthState },
}));

const mockServer: {
  id: string;
  url: string;
  fallbackUrl: string | undefined;
  type: string;
} = {
  id: "srv-1",
  url: "http://192.168.1.10:4533",
  fallbackUrl: "https://music.example.com",
  type: "navidrome",
};
jest.mock("@/stores/servers", () => ({
  useServersBase: {
    getState: () => ({
      getServerById: (id: string) =>
        id === mockServer.id ? mockServer : undefined,
    }),
  },
}));

const mockQueueState: { queue: Array<Record<string, unknown>> } = { queue: [] };
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueState,
    setState: (patch: { queue: Array<Record<string, unknown>> }) => {
      mockQueueState.queue = patch.queue;
    },
  },
}));

import { rewriteQueueRoutes } from "@/services/routeSwap";

const PRIMARY = "http://192.168.1.10:4533";
const FALLBACK = "https://music.example.com";

const track = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  url: `${PRIMARY}/rest/stream?id=t1`,
  artwork: `${PRIMARY}/rest/getCoverArt?id=c1`,
  ...over,
});

beforeEach(() => {
  mockAuthState.serverId = "srv-1";
  mockAuthState.url = PRIMARY;
  mockAuthState.serverType = "navidrome";
  mockServer.url = PRIMARY;
  mockServer.fallbackUrl = FALLBACK;
  mockQueueState.queue = [];
});

describe("rewriteQueueRoutes", () => {
  it("repoints entries baked under the other route at the active one", () => {
    mockAuthState.url = FALLBACK;
    mockQueueState.queue = [track()];
    rewriteQueueRoutes();
    expect(mockQueueState.queue[0]).toMatchObject({
      url: `${FALLBACK}/rest/stream?id=t1`,
      artwork: `${FALLBACK}/rest/getCoverArt?id=c1`,
    });
  });

  it("repoints back to the primary when it becomes active again", () => {
    mockAuthState.url = PRIMARY;
    mockQueueState.queue = [
      track({
        url: `${FALLBACK}/rest/stream?id=t1`,
        artwork: `${FALLBACK}/rest/getCoverArt?id=c1`,
      }),
    ];
    rewriteQueueRoutes();
    expect(mockQueueState.queue[0]).toMatchObject({
      artwork: `${PRIMARY}/rest/getCoverArt?id=c1`,
    });
  });

  it("leaves offline, radio and podcast URLs alone", () => {
    mockAuthState.url = FALLBACK;
    const offline = track({
      id: "off",
      url: "file:///doc/offline/srv_1_alice/off.mp3",
      artwork: "file:///doc/offline/srv_1_alice/off.jpg",
    });
    const radio = track({
      id: "radio",
      url: "https://stream.radio.example/live",
      artwork: "https://cdn.radio.example/logo.png",
      isRadio: true,
    });
    const podcast = track({
      id: "pod",
      url: "https://feeds.example.com/ep1.mp3",
      artwork: "https://feeds.example.com/cover.jpg",
      source: "podcast",
    });
    mockQueueState.queue = [offline, radio, podcast];
    rewriteQueueRoutes();
    // Nothing matched a known route, so the entries are untouched by identity.
    expect(mockQueueState.queue[0]).toBe(offline);
    expect(mockQueueState.queue[1]).toBe(radio);
    expect(mockQueueState.queue[2]).toBe(podcast);
  });

  it("is idempotent", () => {
    mockAuthState.url = FALLBACK;
    mockQueueState.queue = [track()];
    rewriteQueueRoutes();
    const first = mockQueueState.queue[0];
    rewriteQueueRoutes();
    // Already on the active route: no match, no new object.
    expect(mockQueueState.queue[0]).toBe(first);
  });

  it("does nothing when the server has no fallback", () => {
    mockServer.fallbackUrl = undefined;
    const only = track();
    mockQueueState.queue = [only];
    rewriteQueueRoutes();
    expect(mockQueueState.queue[0]).toBe(only);
  });

  it("does nothing for a local library", () => {
    mockAuthState.serverType = "local";
    const only = track({ url: "file:///music/a.mp3" });
    mockQueueState.queue = [only];
    rewriteQueueRoutes();
    expect(mockQueueState.queue[0]).toBe(only);
  });

  it("preserves a base path and prefers the longer route match", () => {
    // One route being a prefix of the other is the case a naive origin match
    // gets wrong.
    mockServer.url = "https://example.com";
    mockServer.fallbackUrl = "https://example.com/music";
    mockAuthState.url = "https://example.com";
    mockQueueState.queue = [
      track({ artwork: "https://example.com/music/rest/getCoverArt?id=c1" }),
    ];
    rewriteQueueRoutes();
    expect(mockQueueState.queue[0].artwork).toBe(
      "https://example.com/rest/getCoverArt?id=c1",
    );
  });

  it("tolerates a trailing slash on the saved route", () => {
    mockServer.fallbackUrl = `${FALLBACK}/`;
    mockAuthState.url = FALLBACK;
    mockQueueState.queue = [track()];
    rewriteQueueRoutes();
    expect(mockQueueState.queue[0].artwork).toBe(
      `${FALLBACK}/rest/getCoverArt?id=c1`,
    );
  });
});
