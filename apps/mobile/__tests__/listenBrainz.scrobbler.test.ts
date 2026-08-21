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
// the ListenBrainz queue is that it drains on *device* connectivity, even when
// the music server is unreachable.
let mockDeviceOnline = true;
let mockEffectiveOnline = true;
let onlineListener: (() => void) | null = null;

jest.mock("@/services/network", () => ({
  getIsOnline: () => mockDeviceOnline,
  getIsEffectivelyOnline: () => mockEffectiveOnline,
  subscribeIsOnline: (cb: () => void) => {
    onlineListener = cb;
    return () => {
      onlineListener = null;
    };
  },
}));

jest.mock("@/services/errorReporting", () => ({
  isNetworkNoise: (error: unknown) =>
    !!(error as { isNetworkError?: boolean } | null)?.isNetworkError,
  reportError: jest.fn(),
}));

jest.mock("expo-application", () => ({ nativeApplicationVersion: "9.9.9" }));

jest.mock("@/services/listenBrainz/client", () => ({
  MAX_LISTENS_PER_REQUEST: 1000,
  submitListens: jest.fn(),
  submitNowPlaying: jest.fn(),
}));

import { reportError } from "@/services/errorReporting";
import {
  submitNowPlaying as postNowPlaying,
  submitListens,
} from "@/services/listenBrainz/client";
import { toListen, toQueuedListen } from "@/services/listenBrainz/payload";
import {
  drainListenQueue,
  enqueueListen,
  initListenBrainzScrobbler,
  isSubmittableDuration,
  MAX_ATTEMPTS,
  stopListenBrainzScrobbler,
  submissionThresholdSeconds,
  submitNowPlaying,
} from "@/services/listenBrainz/scrobbler";
import { useListenBrainzBase } from "@/stores/listenBrainz";
import type { QueueTrack } from "@/stores/queue";

const submitListensMock = submitListens as jest.Mock;
const postNowPlayingMock = postNowPlaying as jest.Mock;
const reportErrorMock = reportError as jest.Mock;

const track = (overrides: Partial<QueueTrack> = {}): QueueTrack =>
  ({
    id: "t1",
    url: "http://server/stream/t1",
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    album: "Whenever You Need Somebody",
    duration: 213,
    musicBrainzId: "mbid-1",
    track: 3,
    ...overrides,
  }) as QueueTrack;

const httpError = (status: number) => ({
  isAxiosError: true,
  response: { status },
});

const queue = () => useListenBrainzBase.getState().queue;

const drain = async () => {
  const promise = drainListenQueue();
  await jest.advanceTimersByTimeAsync(10_000);
  await promise;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockDeviceOnline = true;
  mockEffectiveOnline = true;
  onlineListener = null;
  stopListenBrainzScrobbler();
  useListenBrainzBase.setState({
    token: "lb-token",
    userName: "joel",
    scrobblingEnabled: true,
    submitNowPlaying: true,
    queue: [],
  });
  submitListensMock.mockResolvedValue(undefined);
});

afterEach(() => {
  stopListenBrainzScrobbler();
  jest.useRealTimers();
});

describe("submission threshold", () => {
  it("submits at half the track for anything under eight minutes", () => {
    expect(submissionThresholdSeconds(213)).toBe(106.5);
  });

  it("caps at four minutes for long tracks", () => {
    // A 20-minute track must not wait 10 minutes.
    expect(submissionThresholdSeconds(1200)).toBe(240);
  });

  it("is far later than the server scrobble at 5s", () => {
    // Guards the reason this gate exists at all: reusing the app's
    // COUNT_PLAY_AFTER_SECONDS would over-report skipped tracks.
    expect(submissionThresholdSeconds(213)).toBeGreaterThan(5);
  });

  it("rejects tracks shorter than 30 seconds", () => {
    expect(isSubmittableDuration(29)).toBe(false);
    expect(isSubmittableDuration(30)).toBe(true);
  });
});

describe("payload mapping", () => {
  it("omits absent optional fields entirely and never emits mbid_mapping", () => {
    const queued = toQueuedListen(
      track({
        album: undefined,
        musicBrainzId: undefined,
        track: undefined,
        duration: undefined,
      } as Partial<QueueTrack>),
      1_700_000_000,
    );
    const listen = toListen(queued!, { includeTimestamp: true });

    expect(listen.track_metadata).not.toHaveProperty("release_name");
    const info = listen.track_metadata.additional_info!;
    expect(info).not.toHaveProperty("recording_mbid");
    expect(info).not.toHaveProperty("release_mbid");
    expect(info).not.toHaveProperty("duration_ms");
    expect(info).not.toHaveProperty("tracknumber");
    expect(JSON.stringify(listen)).not.toContain("mbid_mapping");
  });

  it("carries the recording MBID, duration and track number when present", () => {
    const queued = toQueuedListen(track(), 1_700_000_000);
    const listen = toListen(queued!, { includeTimestamp: true });

    expect(listen.listened_at).toBe(1_700_000_000);
    expect(listen.track_metadata.artist_name).toBe("Rick Astley");
    expect(listen.track_metadata.track_name).toBe("Never Gonna Give You Up");
    expect(listen.track_metadata.additional_info).toMatchObject({
      recording_mbid: "mbid-1",
      duration_ms: 213_000,
      tracknumber: "3",
      submission_client: "Wavio",
      submission_client_version: "9.9.9",
    });
  });

  it("omits listened_at for a playing_now submission", () => {
    const queued = toQueuedListen(track(), 1_700_000_000);
    const listen = toListen(queued!, { includeTimestamp: false });
    expect(listen).not.toHaveProperty("listened_at");
  });

  it("refuses tracks ListenBrainz can't be told about honestly", () => {
    // Radio: the queue entry is the station, not the song playing on it.
    expect(
      toQueuedListen(track({ isRadio: true } as Partial<QueueTrack>), 1),
    ).toBeNull();
    expect(
      toQueuedListen(track({ source: "podcast" } as Partial<QueueTrack>), 1),
    ).toBeNull();
    // childToTrack substitutes an empty artist for untagged files.
    expect(toQueuedListen(track({ artist: "" }), 1)).toBeNull();
    expect(toQueuedListen(track({ title: "   " }), 1)).toBeNull();
    // …and a localised "Unknown" title, which is non-empty, so the flag it sets
    // alongside is what has to be trusted.
    expect(
      toQueuedListen(
        track({ title: "Unknown", isUntitled: true } as Partial<QueueTrack>),
        1,
      ),
    ).toBeNull();
  });
});

describe("offline queueing", () => {
  it("keeps the original listened_at when submitted later", async () => {
    mockDeviceOnline = false;
    enqueueListen(track(), 1_700_000_000_000);
    expect(queue()).toHaveLength(1);
    expect(submitListensMock).not.toHaveBeenCalled();

    mockDeviceOnline = true;
    await drain();

    expect(submitListensMock).toHaveBeenCalledTimes(1);
    const payload = submitListensMock.mock.calls[0][0];
    // Seconds, not milliseconds, and the moment playback started.
    expect(payload.payload[0].listened_at).toBe(1_700_000_000);
    expect(queue()).toHaveLength(0);
  });

  it("drains while the music server is unreachable but the device is online", async () => {
    // The core reason this queue uses getIsOnline rather than
    // getIsEffectivelyOnline: ListenBrainz has nothing to do with the user's
    // music server, and a local library has no server at all.
    mockEffectiveOnline = false;
    mockDeviceOnline = true;
    enqueueListen(track(), 1_700_000_000_000);
    await drain();

    expect(submitListensMock).toHaveBeenCalledTimes(1);
    expect(queue()).toHaveLength(0);
  });

  it("drains on the offline to online transition", async () => {
    mockDeviceOnline = false;
    enqueueListen(track(), 1_700_000_000_000);
    initListenBrainzScrobbler();
    expect(submitListensMock).not.toHaveBeenCalled();

    mockDeviceOnline = true;
    onlineListener?.();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(submitListensMock).toHaveBeenCalledTimes(1);
  });

  it("does not queue anything while scrobbling is disabled", () => {
    useListenBrainzBase.setState({ scrobblingEnabled: false });
    enqueueListen(track(), 1_700_000_000_000);
    expect(queue()).toHaveLength(0);
  });

  it("still drains plays queued before scrobbling was turned off", async () => {
    mockDeviceOnline = false;
    enqueueListen(track(), 1_700_000_000_000);
    mockDeviceOnline = true;
    useListenBrainzBase.setState({ scrobblingEnabled: false });
    await drain();

    // "Send now" has to mean something for listens that were already earned.
    expect(submitListensMock).toHaveBeenCalledTimes(1);
    expect(queue()).toHaveLength(0);
  });

  it("does not drain once disconnected", async () => {
    mockDeviceOnline = false;
    enqueueListen(track(), 1_700_000_000_000);
    mockDeviceOnline = true;
    useListenBrainzBase.getState().clearConfig();
    await drain();

    expect(submitListensMock).not.toHaveBeenCalled();
    // Removing the token keeps the plays — a rotated token can still send them.
    expect(queue()).toHaveLength(1);
  });
});

describe("batching", () => {
  it("sends a lone listen as `single`", async () => {
    enqueueListen(track(), 1_700_000_000_000);
    await drain();
    expect(submitListensMock.mock.calls[0][0].listen_type).toBe("single");
  });

  it("splits at 1000 per request and uses `import`", async () => {
    mockDeviceOnline = false;
    for (let i = 0; i < 1200; i++) {
      enqueueListen(track({ id: `t${i}` }), 1_700_000_000_000 + i * 1000);
    }
    mockDeviceOnline = true;
    await drain();

    expect(submitListensMock).toHaveBeenCalledTimes(2);
    const [first, second] = submitListensMock.mock.calls.map((c) => c[0]);
    expect(first.listen_type).toBe("import");
    expect(first.payload).toHaveLength(1000);
    expect(second.payload).toHaveLength(200);
    expect(queue()).toHaveLength(0);
  });
});

describe("error handling", () => {
  it("drops the batch on a 401 rather than retrying forever", async () => {
    submitListensMock.mockRejectedValue(httpError(401));
    enqueueListen(track(), 1_700_000_000_000);
    await drain();

    expect(queue()).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][1]).toMatchObject({
      api: "listenbrainz",
      status: 401,
      unauthorizedIsExpected: true,
    });
  });

  it("keeps the batch and backs off on a 429", async () => {
    submitListensMock.mockRejectedValue(httpError(429));
    // enqueueListen drains on its own, so this is exactly one attempt.
    enqueueListen(track(), 1_700_000_000_000);
    await jest.advanceTimersByTimeAsync(0);

    // Rate limiting is the API asking us to wait, never a reason to lose a play.
    expect(submitListensMock).toHaveBeenCalledTimes(1);
    expect(queue()).toHaveLength(1);
    expect(queue()[0].retryCount).toBe(1);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("outlasts a long outage before giving up on a 500", async () => {
    submitListensMock.mockRejectedValue(httpError(500));
    enqueueListen(track(), 1_700_000_000_000);
    // A 30-minute outage must not cost the user their plays: the old 5-attempt
    // cap ran out in under nine minutes.
    for (let attempt = 0; attempt < 10; attempt++) await drain();
    expect(queue()).toHaveLength(1);
    expect(reportErrorMock).not.toHaveBeenCalled();

    for (let attempt = 10; attempt < MAX_ATTEMPTS; attempt++) await drain();
    expect(queue()).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the batch and reports nothing on a network error", async () => {
    submitListensMock.mockRejectedValue({ isNetworkError: true });
    enqueueListen(track(), 1_700_000_000_000);
    await drain();

    expect(queue()).toHaveLength(1);
    expect(queue()[0].retryCount).toBe(0);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });
});

describe("now playing", () => {
  it("is sent without a timestamp and never queued", () => {
    submitNowPlaying(track());
    expect(postNowPlayingMock).toHaveBeenCalledTimes(1);
    const payload = postNowPlayingMock.mock.calls[0][0];
    expect(payload.listen_type).toBe("playing_now");
    expect(payload.payload[0]).not.toHaveProperty("listened_at");
    expect(queue()).toHaveLength(0);
  });

  it("is skipped while offline rather than queued", () => {
    mockDeviceOnline = false;
    submitNowPlaying(track());
    expect(postNowPlayingMock).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(0);
  });

  it("respects the now-playing toggle independently of scrobbling", () => {
    useListenBrainzBase.setState({ submitNowPlaying: false });
    submitNowPlaying(track());
    expect(postNowPlayingMock).not.toHaveBeenCalled();
  });
});
