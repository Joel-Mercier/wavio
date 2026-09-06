// Mock MMKV-backed storage with an in-memory implementation
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ url: "u", username: "n", serverType: "navidrome" }),
  },
  currentAuthScope: () => "scope",
}));

// The two connectivity axes are mocked separately on purpose: the whole point of
// the Last.fm queue is that it drains on *device* connectivity, even when the
// music server is unreachable.
let mockDeviceOnline = true;
let onlineListener: (() => void) | null = null;

jest.mock("@/services/network", () => ({
  getIsOnline: () => mockDeviceOnline,
  getIsEffectivelyOnline: () => true,
  subscribeIsOnline: (cb: () => void) => {
    onlineListener = cb;
    return () => {
      onlineListener = null;
    };
  },
}));

const mockReportError = jest.fn();
const mockReportBreadcrumb = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  isNetworkNoise: (error: unknown) =>
    !!(error as { isNetworkError?: boolean } | null)?.isNetworkError,
  reportError: (...args: unknown[]) => mockReportError(...args),
  reportBreadcrumb: (...args: unknown[]) => mockReportBreadcrumb(...args),
}));

const mockInvalidateQueries = jest.fn();
jest.mock("@/config/queryClient", () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

jest.mock("@/services/lastFm/api", () => ({
  MAX_SCROBBLES_PER_REQUEST: 50,
  IGNORED: {
    ACCEPTED: 0,
    ARTIST_IGNORED: 1,
    TRACK_IGNORED: 2,
    TIMESTAMP_TOO_OLD: 3,
    TIMESTAMP_TOO_NEW: 4,
    DAILY_LIMIT_EXCEEDED: 5,
  },
  submitScrobbles: jest.fn(),
  updateNowPlaying: jest.fn(),
  loveTrack: jest.fn(),
}));

import {
  loveTrack,
  submitScrobbles,
  updateNowPlaying,
} from "@/services/lastFm/api";
import { LastFmApiError } from "@/services/lastFm/errors";
import { toQueuedScrobble, toScrobbleParams } from "@/services/lastFm/payload";
import {
  drainLastFmQueue,
  enqueueLove,
  enqueueScrobble,
  initLastFmScrobbler,
  stopLastFmScrobbler,
  submitNowPlaying,
} from "@/services/lastFm/scrobbler";
import { useLastFmBase } from "@/stores/lastFm";
import type { QueueTrack } from "@/stores/queue";

const mockSubmit = submitScrobbles as jest.Mock;
const mockNowPlaying = updateNowPlaying as jest.Mock;
const mockLove = loveTrack as jest.Mock;

const OK = { accepted: 1, ignored: 0, ignoredCodes: [] };

const track = (overrides: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id: "t1",
    url: "http://x/1",
    title: "Song",
    artist: "Artist",
    album: "Album",
    duration: 213,
    ...overrides,
  }) as QueueTrack;

const connect = (overrides: Record<string, unknown> = {}) => {
  useLastFmBase.setState({
    sessionKey: "sk",
    userName: "joel",
    scrobblingEnabled: true,
    submitNowPlaying: true,
    syncLoves: true,
    sessionInvalid: false,
    queue: [],
    loveQueue: [],
    ...overrides,
  });
};

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDeviceOnline = true;
  mockSubmit.mockResolvedValue(OK);
  mockNowPlaying.mockResolvedValue(undefined);
  mockLove.mockResolvedValue(undefined);
  useLastFmBase.getState().__reset();
  stopLastFmScrobbler();
});

describe("enqueueScrobble", () => {
  it("does not record a play while disconnected", () => {
    enqueueScrobble(track(), Date.now());
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });

  it("does not record a play while scrobbling is switched off", () => {
    connect({ scrobblingEnabled: false });
    enqueueScrobble(track(), Date.now());
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });

  it("does not record a play once the session has been revoked", () => {
    // Nothing would be accepted, and queueing it would only grow a queue that
    // can't drain until the user signs in again.
    connect({ sessionInvalid: true });
    enqueueScrobble(track(), Date.now());
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });

  it("pins the timestamp to when the track started, in seconds", async () => {
    connect();
    // Offline, so the drain enqueueScrobble kicks off can't empty the queue
    // before the assertion reads it.
    mockDeviceOnline = false;
    const startedAt = Date.now() - 60_000;
    enqueueScrobble(track(), startedAt);
    expect(useLastFmBase.getState().queue[0].timestamp).toBe(
      Math.floor(startedAt / 1000),
    );
    await flush();
  });

  it("refuses a track it cannot describe honestly", () => {
    connect();
    enqueueScrobble(track({ isRadio: true }), Date.now());
    enqueueScrobble(track({ source: "podcast" }), Date.now());
    enqueueScrobble(track({ isUntitled: true }), Date.now());
    enqueueScrobble(track({ artist: "  " }), Date.now());
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });

  it("keeps the play while offline and sends it on reconnect", async () => {
    connect();
    mockDeviceOnline = false;
    initLastFmScrobbler();
    const startedAt = Date.now() - 3 * 24 * 3600 * 1000;
    enqueueScrobble(track(), startedAt);
    await flush();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(useLastFmBase.getState().queue).toHaveLength(1);

    mockDeviceOnline = true;
    onlineListener?.();
    await flush();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    // The original timestamp survives the three-day wait — not the time it was
    // finally sent.
    expect(mockSubmit.mock.calls[0][0].timestamp).toBe(
      Math.floor(startedAt / 1000),
    );
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });
});

describe("chosenByUser", () => {
  it("is 1 for a track the listener picked", () => {
    const queued = toQueuedScrobble(track(), 1);
    expect(queued?.track.chosenByUser).toBe(1);
  });

  it("is 0 for a track endless radio appended", () => {
    // services/endlessRadio.ts tags what it appends; Last.fm defaults this to 1,
    // so an untagged auto-play would overstate the listener's intent.
    const queued = toQueuedScrobble(track({ autoQueued: true }), 1);
    expect(queued?.track.chosenByUser).toBe(0);
  });
});

describe("batching", () => {
  it("omits the array suffix for a single scrobble", () => {
    const queued = toQueuedScrobble(track(), 1_700_000_000);
    if (!queued) throw new Error("track should be scrobblable");
    const params = toScrobbleParams(queued, null);
    expect(params).toMatchObject({
      artist: "Artist",
      track: "Song",
      timestamp: 1_700_000_000,
    });
    expect(Object.keys(params).some((k) => k.includes("["))).toBe(false);
  });

  it("indexes every field of a batched scrobble", () => {
    const queued = toQueuedScrobble(track(), 1_700_000_000);
    if (!queued) throw new Error("track should be scrobblable");
    const params = toScrobbleParams(queued, 7);
    expect(params["artist[7]"]).toBe("Artist");
    expect(params["timestamp[7]"]).toBe(1_700_000_000);
    expect(params.artist).toBeUndefined();
  });

  it("sends at most 50 scrobbles per request, oldest first", async () => {
    connect();
    const base = Math.floor(Date.now() / 1000) - 3600;
    useLastFmBase.setState({
      queue: Array.from({ length: 120 }, (_, i) => ({
        id: `s${i}`,
        timestamp: base + i,
        retryCount: 0,
        track: {
          artist: "A",
          track: `T${i}`,
          chosenByUser: 1 as const,
        },
      })),
    });

    await drainLastFmQueue();
    await flush();

    expect(mockSubmit).toHaveBeenCalledTimes(3);
    // First request carries indices 0..49, and the very oldest play is index 0 —
    // Last.fm requires cached scrobbles to precede newer ones.
    expect(mockSubmit.mock.calls[0][0]["track[0]"]).toBe("T0");
    expect(mockSubmit.mock.calls[0][0]["track[49]"]).toBe("T49");
    expect(mockSubmit.mock.calls[0][0]["track[50]"]).toBeUndefined();
    expect(mockSubmit.mock.calls[1][0]["track[0]"]).toBe("T50");
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });
});

describe("stale scrobbles", () => {
  it("discards plays older than 14 days instead of sending them", async () => {
    // Last.fm answers these with ignoredMessage code 3 and records nothing, so
    // sending them only spends a request. ListenBrainz has no such limit.
    connect();
    const now = Math.floor(Date.now() / 1000);
    useLastFmBase.setState({
      queue: [
        {
          id: "old",
          timestamp: now - 15 * 24 * 3600,
          retryCount: 0,
          track: { artist: "A", track: "Ancient", chosenByUser: 1 as const },
        },
        {
          id: "fresh",
          timestamp: now - 13 * 24 * 3600,
          retryCount: 0,
          track: { artist: "A", track: "Recent", chosenByUser: 1 as const },
        },
      ],
    });

    await drainLastFmQueue();
    await flush();

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit.mock.calls[0][0].track).toBe("Recent");
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });
});

describe("error handling", () => {
  const apiError = (code: number) => new LastFmApiError(code, `error ${code}`);

  it("drops a batch a permanent error can never accept", async () => {
    connect();
    // 13 = invalid method signature. Retrying is guaranteed to fail again.
    mockSubmit.mockRejectedValue(apiError(13));
    enqueueScrobble(track(), Date.now());
    await flush();

    expect(useLastFmBase.getState().queue).toHaveLength(0);
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError.mock.calls[0][1]).toMatchObject({
      api: "lastfm",
      endpoint: "track.scrobble",
      status: 13,
    });
  });

  it("keeps the batch and backs off on a transient error", async () => {
    connect();
    // 29 = rate limited. That is the service asking us to wait, not a verdict.
    mockSubmit.mockRejectedValue(apiError(29));
    enqueueScrobble(track(), Date.now());
    await flush();

    expect(useLastFmBase.getState().queue).toHaveLength(1);
    expect(useLastFmBase.getState().queue[0].retryCount).toBe(1);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("keeps the batch and reports nothing on a network failure", async () => {
    connect();
    mockSubmit.mockRejectedValue({ isNetworkError: true });
    enqueueScrobble(track(), Date.now());
    await flush();

    expect(useLastFmBase.getState().queue).toHaveLength(1);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("flips into the re-auth state on a revoked session and stops draining", async () => {
    connect();
    // 9 = invalid session key. Nothing can be accepted until the user signs in
    // again, so the queue is held rather than burned through.
    mockSubmit.mockRejectedValue(apiError(9));
    enqueueScrobble(track(), Date.now());
    await flush();

    expect(useLastFmBase.getState().sessionInvalid).toBe(true);

    mockSubmit.mockClear();
    await drainLastFmQueue();
    await flush();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("removes a filtered batch without treating it as an error", async () => {
    connect();
    // A non-zero `ignored` count arrives inside a status:"ok" response. The
    // scrobbles will never be accepted, but nothing failed — so the batch goes,
    // and the reason is left as a breadcrumb rather than an error report.
    mockSubmit.mockResolvedValue({
      accepted: 0,
      ignored: 1,
      ignoredCodes: [1],
    });
    enqueueScrobble(track(), Date.now());
    await flush();

    expect(useLastFmBase.getState().queue).toHaveLength(0);
    expect(mockReportError).not.toHaveBeenCalled();
    expect(mockReportBreadcrumb).toHaveBeenCalledWith(
      "lastfm",
      "scrobbles ignored",
      expect.objectContaining({ ignored: 1, codes: [1] }),
    );
  });
});

describe("now playing", () => {
  it("is never queued and is dropped while offline", async () => {
    connect();
    mockDeviceOnline = false;
    submitNowPlaying(track());
    await flush();

    expect(mockNowPlaying).not.toHaveBeenCalled();
    expect(useLastFmBase.getState().queue).toHaveLength(0);
  });

  it("carries no timestamp", async () => {
    connect();
    submitNowPlaying(track());
    await flush();

    expect(mockNowPlaying).toHaveBeenCalledTimes(1);
    expect(mockNowPlaying.mock.calls[0][0].timestamp).toBeUndefined();
    expect(mockNowPlaying.mock.calls[0][0].artist).toBe("Artist");
  });

  it("honours its own toggle independently of scrobbling", async () => {
    connect({ submitNowPlaying: false });
    submitNowPlaying(track());
    await flush();
    expect(mockNowPlaying).not.toHaveBeenCalled();
  });
});

describe("loves", () => {
  it("is not recorded unless the user opted in", () => {
    connect({ syncLoves: false });
    enqueueLove("Artist", "Song", true);
    expect(useLastFmBase.getState().loveQueue).toHaveLength(0);
  });

  it("collapses repeated toggles of the same track to the last one", () => {
    connect();
    mockDeviceOnline = false;
    enqueueLove("Artist", "Song", true);
    enqueueLove("Artist", "Song", false);
    enqueueLove("Artist", "Song", true);

    const queue = useLastFmBase.getState().loveQueue;
    expect(queue).toHaveLength(1);
    expect(queue[0].loved).toBe(true);
  });

  it("sends one request per love, after the scrobbles", async () => {
    connect();
    mockDeviceOnline = false;
    enqueueScrobble(track(), Date.now());
    enqueueLove("Artist", "Song", true);
    enqueueLove("Other", "Tune", false);

    mockDeviceOnline = true;
    await drainLastFmQueue();
    await flush();

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockLove).toHaveBeenCalledTimes(2);
    expect(mockLove.mock.calls[0]).toEqual(["Artist", "Song", true]);
    expect(mockLove.mock.calls[1]).toEqual(["Other", "Tune", false]);
    expect(useLastFmBase.getState().loveQueue).toHaveLength(0);
  });

  it("refreshes the loved-track reads once a love has landed", async () => {
    // Otherwise the settings screen keeps showing the count from before the
    // tap for fifteen minutes, which is also what greys out the import.
    connect();
    enqueueLove("Artist", "Song", true);
    await flush();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["lastfm", "lovedTracks"],
    });
  });

  it("does not refresh the loved-track reads when nothing was accepted", async () => {
    connect();
    mockDeviceOnline = false;
    enqueueLove("Artist", "Song", true);
    mockLove.mockRejectedValue({ isNetworkError: true });

    mockDeviceOnline = true;
    await drainLastFmQueue();
    await flush();

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("does not let a stuck love block playback history", async () => {
    connect();
    mockDeviceOnline = false;
    enqueueScrobble(track(), Date.now());
    enqueueLove("Artist", "Song", true);
    mockLove.mockRejectedValue({ isNetworkError: true });

    mockDeviceOnline = true;
    await drainLastFmQueue();
    await flush();

    // The scrobble went out even though the love could not.
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(useLastFmBase.getState().queue).toHaveLength(0);
    expect(useLastFmBase.getState().loveQueue).toHaveLength(1);
  });
});

describe("drain gating", () => {
  it("drains a queue left by a previous session even with scrobbling off", async () => {
    // Those plays were earned while it was on; switching it off must stop new
    // ones being recorded, not strand the pending ones.
    connect({ scrobblingEnabled: false });
    useLastFmBase.setState({
      queue: [
        {
          id: "s1",
          timestamp: Math.floor(Date.now() / 1000) - 60,
          retryCount: 0,
          track: { artist: "A", track: "T", chosenByUser: 1 as const },
        },
      ],
    });

    await drainLastFmQueue();
    await flush();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not drain while disconnected", async () => {
    useLastFmBase.setState({
      sessionKey: "",
      userName: null,
      queue: [
        {
          id: "s1",
          timestamp: Math.floor(Date.now() / 1000) - 60,
          retryCount: 0,
          track: { artist: "A", track: "T", chosenByUser: 1 as const },
        },
      ],
    });

    await drainLastFmQueue();
    await flush();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
