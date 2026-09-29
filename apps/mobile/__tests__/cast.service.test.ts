import { NativeModules } from "react-native";

type Handler = (...args: unknown[]) => void;
const mockSessionHandlers: Record<string, Handler> = {};
let mockStatusListener: ((status: unknown) => void) | null = null;
let mockProgressListener:
  | ((progress: number, duration: number) => void)
  | null = null;

const mockClient = {
  loadMedia: jest.fn(async () => undefined),
  play: jest.fn(async () => undefined),
  pause: jest.fn(async () => undefined),
  seek: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  getMediaStatus: jest.fn(async (): Promise<unknown> => null),
  onMediaStatusUpdated: jest.fn((cb: (status: unknown) => void) => {
    mockStatusListener = cb;
    return {
      remove: () => {
        mockStatusListener = null;
      },
    };
  }),
  onMediaProgressUpdated: jest.fn(
    (cb: (progress: number, duration: number) => void) => {
      mockProgressListener = cb;
      return {
        remove: () => {
          mockProgressListener = null;
        },
      };
    },
  ),
};

const mockSessionManager = {
  onSessionStarted: jest.fn((cb: Handler) => {
    mockSessionHandlers.started = cb;
  }),
  onSessionEnded: jest.fn((cb: Handler) => {
    mockSessionHandlers.ended = cb;
  }),
  onSessionResumed: jest.fn((cb: Handler) => {
    mockSessionHandlers.resumed = cb;
  }),
  onSessionSuspended: jest.fn((cb: Handler) => {
    mockSessionHandlers.suspended = cb;
  }),
  getCurrentCastSession: jest.fn(async () => null),
  endCurrentSession: jest.fn(async () => undefined),
};

jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  CastContext: {
    getSessionManager: () => mockSessionManager,
    getCastState: async () => "notConnected",
  },
  RemoteMediaClient: function RemoteMediaClient() {
    return mockClient;
  },
  MediaPlayerState: {
    BUFFERING: "buffering",
    IDLE: "idle",
    LOADING: "loading",
    PAUSED: "paused",
    PLAYING: "playing",
  },
  MediaPlayerIdleReason: {
    CANCELLED: "cancelled",
    ERROR: "error",
    FINISHED: "finished",
    INTERRUPTED: "interrupted",
  },
  MediaStreamType: { BUFFERED: "buffered", LIVE: "live", OTHER: "other" },
}));

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string) => `http://server/rest/stream?id=${id}&u=x&t=y&s=z`,
}));

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

const mockRaiseNotice = jest.fn();
jest.mock("@/stores/playbackNotice", () => ({
  __esModule: true,
  default: { getState: () => ({ raise: mockRaiseNotice }) },
}));

const localPlayer = { playing: true, position: 12 };
const mockTakeOverFromRemote = jest.fn();
const mockPauseLocal = jest.fn();
// Like the real player, position and state come from whichever remote is
// active, and from this device otherwise.
jest.mock("@/services/player", () => ({
  getCurrentTime: () =>
    require("@/services/playback/remoteTarget")
      .activeRemoteTarget()
      ?.getCurrentTime() ?? localPlayer.position,
  isPlaying: () =>
    require("@/services/playback/remoteTarget")
      .activeRemoteTarget()
      ?.isPlaying() ?? localPlayer.playing,
  pause: (...args: unknown[]) => mockPauseLocal(...args),
  takeOverFromRemote: (...args: unknown[]) => mockTakeOverFromRemote(...args),
}));

const mockRecordPodcastProgress = jest.fn();
jest.mock("@/services/podcastProgress", () => ({
  isPodcastTrack: (track: { source?: string } | null) =>
    track?.source === "podcast",
  recordPodcastProgress: (...args: unknown[]) =>
    mockRecordPodcastProgress(...args),
}));

jest.mock("@/utils/podcastEpisodeToTrack", () => ({
  podcastStreamUrl: (track: { enclosureUrl?: string }) => track.enclosureUrl,
}));

jest.mock("@/stores/auth", () => ({
  registerLogoutHandler: jest.fn(),
}));

jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({
      streamingFormat: "raw",
      cellularStreamingFormat: "same",
    }),
  },
}));

jest.mock("@/services/network", () => ({
  getEffectiveStreamingFormat: (format: string) => format,
}));

type Track = {
  id: string;
  title?: string;
  duration?: number;
  suffix?: string;
  source?: string;
  enclosureUrl?: string;
  isRadio?: boolean;
};
const mockQueueSubscribers = new Set<(state: typeof mockQueueState) => void>();
const mockQueueState = {
  queue: [] as Track[],
  currentIndex: 0 as number | null,
  repeatMode: "off" as "off" | "all" | "one",
  removePlayed: false,
  getCurrent(): Track | null {
    return this.currentIndex == null
      ? null
      : (this.queue[this.currentIndex] ?? null);
  },
  next: jest.fn(),
  previous: jest.fn(),
};
const moveQueueTo = (index: number) => {
  mockQueueState.currentIndex = index;
  for (const cb of mockQueueSubscribers) cb(mockQueueState);
};
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueState,
    subscribe: jest.fn((cb: (state: typeof mockQueueState) => void) => {
      mockQueueSubscribers.add(cb);
      return () => mockQueueSubscribers.delete(cb);
    }),
  },
}));

// The service only wires itself where the Cast SDK's native modules exist.
NativeModules.RNGCSessionManager = {};
NativeModules.RNGCRemoteMediaClient = {};

import {
  activeRemoteTarget,
  registerRemoteTarget,
} from "@/services/playback/remoteTarget";

let castDisconnect: () => Promise<void>;
let useCastBase: typeof import("@/stores/cast").useCastBase;

beforeAll(() => {
  ({ castDisconnect } = require("@/services/cast"));
  ({ useCastBase } = require("@/stores/cast"));
});

const session = {
  id: "session-1",
  client: mockClient,
  getCastDevice: async () => ({ friendlyName: "Living Room" }),
  getVolume: async () => 0.5,
  setVolume: jest.fn(),
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const lastLoad = () =>
  (mockClient.loadMedia.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
    autoplay?: boolean;
    startTime?: number;
    mediaInfo: {
      contentUrl: string;
      contentType: string;
      streamType: string;
      customData: { trackId: string; generation: number };
    };
  };

const status = (
  playerState: string,
  extra: {
    idleReason?: string;
    streamPosition?: number;
    generation?: number;
    duration?: number;
  } = {},
) =>
  mockStatusListener?.({
    playerState,
    idleReason: extra.idleReason ?? null,
    streamPosition: extra.streamPosition ?? 0,
    mediaInfo: {
      streamDuration: extra.duration ?? 100,
      customData: {
        generation:
          extra.generation ?? lastLoad()?.mediaInfo.customData.generation,
      },
    },
    queueItems: [],
    isMuted: false,
    playbackRate: 1,
    volume: 1,
  });

const TRACK: Track = { id: "t1", title: "One", duration: 100, suffix: "flac" };

async function startSession() {
  mockQueueState.queue = [TRACK, { id: "t2", title: "Two", duration: 100 }];
  mockQueueState.currentIndex = 0;
  mockQueueState.repeatMode = "off";
  mockSessionHandlers.started?.(session);
  await settle();
}

// Another output — a renderer, say — that may be active when a session starts.
let otherActive = false;
const otherRelease = jest.fn(async () => {
  otherActive = false;
});
const noop = () => {};
registerRemoteTarget({
  id: "other",
  isActive: () => otherActive,
  play: noop,
  pause: noop,
  togglePlayPause: noop,
  seekTo: noop,
  skipNext: noop,
  skipPrevious: noop,
  getCurrentTime: () => 77,
  isPlaying: () => true,
  release: otherRelease,
  isInterpolating: () => false,
  readSnapshot: () => ({
    playing: true,
    buffering: false,
    currentTime: 77,
    duration: 100,
  }),
  subscribe: () => noop,
});

const existingStatus = (
  playerState: string,
  streamPosition: number,
  customData: object | undefined,
  contentUrl = "http://server/rest/stream?id=t1&u=x&t=other&s=salt",
) => ({
  playerState,
  idleReason: null,
  streamPosition,
  mediaInfo: { contentUrl, streamDuration: 300, customData },
  queueItems: [],
  isMuted: false,
  playbackRate: 1,
  volume: 1,
});

beforeEach(() => {
  jest.clearAllMocks();
  otherActive = false;
  mockClient.getMediaStatus.mockResolvedValue(null);
  mockClient.loadMedia.mockResolvedValue(undefined);
  mockClient.play.mockResolvedValue(undefined);
  mockClient.pause.mockResolvedValue(undefined);
  mockClient.seek.mockResolvedValue(undefined);
  mockSessionManager.endCurrentSession.mockResolvedValue(undefined);
  localPlayer.playing = true;
  localPlayer.position = 12;
  mockQueueSubscribers.clear();
});

afterEach(async () => {
  if (useCastBase.getState().active) await castDisconnect();
});

describe("starting a session", () => {
  it("pauses this device and hands the current track to the receiver from where it was", async () => {
    await startSession();
    expect(mockPauseLocal).toHaveBeenCalled();
    const load = lastLoad();
    expect(load.autoplay).toBe(true);
    expect(load.startTime).toBe(12);
    expect(load.mediaInfo.contentUrl).toContain("/rest/stream?id=t1");
    expect(load.mediaInfo.contentType).toBe("audio/flac");
    expect(load.mediaInfo.streamType).toBe("buffered");
    expect(load.mediaInfo.customData).toEqual({ trackId: "t1", generation: 1 });
    expect(useCastBase.getState().active).toBe(true);
    expect(useCastBase.getState().deviceName).toBe("Living Room");
    expect(activeRemoteTarget()?.id).toBe("cast");
  });

  it("keeps the receiver parked when this device was paused", async () => {
    localPlayer.playing = false;
    await startSession();
    expect(lastLoad().autoplay).toBe(false);
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
  });

  it("adopts the receiver's own volume", async () => {
    await startSession();
    expect(useCastBase.getState().volume).toBeCloseTo(0.5);
  });

  it("releases another output that was active and picks up from where it was, without a hand-back", async () => {
    otherActive = true;
    await startSession();
    expect(otherRelease).toHaveBeenCalledTimes(1);
    expect(otherRelease.mock.invocationCallOrder[0]).toBeLessThan(
      mockClient.loadMedia.mock.invocationCallOrder[0],
    );
    expect(mockPauseLocal).not.toHaveBeenCalled();
    expect(mockTakeOverFromRemote).not.toHaveBeenCalled();
    expect(lastLoad().autoplay).toBe(true);
    expect(lastLoad().startTime).toBe(77);
    expect(activeRemoteTarget()?.id).toBe("cast");
  });
});

describe("picking up a session the receiver is already playing", () => {
  it("keeps the receiver's state when it is on this phone's track", async () => {
    mockClient.getMediaStatus.mockResolvedValue(
      existingStatus("playing", 106, { trackId: "t1", generation: 3 }),
    );
    localPlayer.playing = false;
    localPlayer.position = 0;
    await startSession();
    expect(mockClient.loadMedia).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.isPlaying()).toBe(true);
    expect(activeRemoteTarget()?.getCurrentTime()).toBeGreaterThanOrEqual(106);
    // Its statuses keep being believed, and the next load numbers on from it.
    status("paused", { streamPosition: 110, generation: 3 });
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    moveQueueTo(1);
    await settle();
    expect(lastLoad().mediaInfo.customData.generation).toBe(4);
  });

  it("recognises its track by stream URL when the receiver carries no custom data", async () => {
    mockClient.getMediaStatus.mockResolvedValue(
      existingStatus("paused", 40, undefined),
    );
    await startSession();
    expect(mockClient.loadMedia).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    expect(activeRemoteTarget()?.getCurrentTime()).toBeCloseTo(40, 0);
  });

  it("loads as usual when the receiver is on something else, or on nothing", async () => {
    mockClient.getMediaStatus.mockResolvedValue(
      existingStatus("playing", 106, { trackId: "elsewhere", generation: 3 }),
    );
    await startSession();
    expect(mockClient.loadMedia).toHaveBeenCalledTimes(1);
    expect(lastLoad().startTime).toBe(12);
    await castDisconnect();
    mockClient.getMediaStatus.mockResolvedValue(
      existingStatus("idle", 0, { trackId: "t1", generation: 3 }),
    );
    await startSession();
    expect(mockClient.loadMedia).toHaveBeenCalledTimes(2);
  });
});

describe("the receiver finishing a track", () => {
  it("advances the queue once", async () => {
    await startSession();
    status("playing", { streamPosition: 95 });
    status("idle", { idleReason: "finished", streamPosition: 100 });
    status("idle", { idleReason: "finished", streamPosition: 100 });
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
  });

  it("pushes the next track when the queue moves", async () => {
    await startSession();
    moveQueueTo(1);
    await settle();
    expect(mockClient.loadMedia).toHaveBeenCalledTimes(2);
    expect(lastLoad().mediaInfo.customData).toEqual({
      trackId: "t2",
      generation: 2,
    });
  });

  it("ignores a status about a track it has since replaced", async () => {
    await startSession();
    moveQueueTo(1);
    await settle();
    status("idle", { idleReason: "finished", generation: 1 });
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("stops at the end of the queue rather than advancing past it", async () => {
    await startSession();
    mockQueueState.currentIndex = 1;
    status("playing", { streamPosition: 95 });
    status("idle", { idleReason: "finished" });
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("is not fooled by its own reload", async () => {
    await startSession();
    status("playing", { streamPosition: 50 });
    status("idle", { idleReason: "interrupted" });
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.isPlaying()).toBe(true);
  });

  it("parks the last track at the top when the queue runs out, and restarts it on play", async () => {
    await startSession();
    mockQueueState.currentIndex = 1;
    status("playing", { streamPosition: 95 });
    status("idle", { idleReason: "finished" });
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockClient.pause).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    expect(activeRemoteTarget()?.getCurrentTime()).toBe(0);
    activeRemoteTarget()?.play();
    await settle();
    expect(mockClient.play).not.toHaveBeenCalled();
    expect(mockClient.loadMedia).toHaveBeenCalledTimes(2);
    expect(lastLoad().autoplay).toBe(true);
    expect(lastLoad().startTime).toBeUndefined();
    expect(lastLoad().mediaInfo.customData.trackId).toBe("t2");
  });
});

describe("the receiver being stopped from elsewhere", () => {
  it("holds where it was and reloads from there on play", async () => {
    await startSession();
    status("playing", { streamPosition: 50 });
    status("idle", { idleReason: "cancelled" });
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    expect(activeRemoteTarget()?.getCurrentTime()).toBeCloseTo(50, 0);
    activeRemoteTarget()?.pause();
    await settle();
    expect(mockClient.pause).not.toHaveBeenCalled();
    activeRemoteTarget()?.play();
    await settle();
    expect(mockClient.play).not.toHaveBeenCalled();
    expect(mockClient.loadMedia).toHaveBeenCalledTimes(2);
    expect(lastLoad().autoplay).toBe(true);
    expect(lastLoad().startTime).toBe(50);
    expect(lastLoad().mediaInfo.customData.trackId).toBe("t1");
  });

  it("moves the resume point on seek without asking the receiver", async () => {
    await startSession();
    status("playing", { streamPosition: 50 });
    status("idle", { idleReason: "cancelled" });
    activeRemoteTarget()?.seekTo(30);
    await settle();
    expect(mockClient.seek).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.getCurrentTime()).toBe(30);
    activeRemoteTarget()?.play();
    await settle();
    expect(lastLoad().startTime).toBe(30);
  });
});

describe("a track the receiver cannot play", () => {
  it("skips one on its own after a receiver error, then holds and says so", async () => {
    mockQueueState.next.mockImplementation(() =>
      moveQueueTo((mockQueueState.currentIndex ?? 0) + 1),
    );
    mockQueueState.queue = [
      TRACK,
      { id: "t2", duration: 100 },
      { id: "t3", duration: 100 },
    ];
    await startSession();
    status("idle", { idleReason: "error" });
    await settle();
    expect(mockQueueState.currentIndex).toBe(1);
    status("idle", { idleReason: "error" });
    await settle();
    expect(mockQueueState.currentIndex).toBe(1);
    expect(mockRaiseNotice).toHaveBeenCalledWith(
      "REMOTE_TRACK_REFUSED",
      expect.objectContaining({ name: "Living Room" }),
    );
  });

  it("holds the queue and tells the listener when a load they asked for is refused", async () => {
    await startSession();
    mockClient.loadMedia.mockRejectedValueOnce(new Error("Load failed"));
    moveQueueTo(1);
    await settle();
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockRaiseNotice).toHaveBeenCalledWith(
      "REMOTE_TRACK_REFUSED",
      expect.objectContaining({ track: "Two" }),
    );
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
  });
});

describe("transport", () => {
  it("pauses and plays the receiver, showing the change at once", async () => {
    await startSession();
    status("playing", { streamPosition: 30 });
    activeRemoteTarget()?.pause();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    await settle();
    expect(mockClient.pause).toHaveBeenCalled();
    activeRemoteTarget()?.play();
    expect(activeRemoteTarget()?.isPlaying()).toBe(true);
    await settle();
    expect(mockClient.play).toHaveBeenCalled();
  });

  it("undoes the guess when the receiver refuses", async () => {
    await startSession();
    status("playing", { streamPosition: 30 });
    mockClient.pause.mockRejectedValueOnce(new Error("no"));
    activeRemoteTarget()?.pause();
    await settle();
    expect(activeRemoteTarget()?.isPlaying()).toBe(true);
  });

  it("seeks the receiver", async () => {
    await startSession();
    activeRemoteTarget()?.seekTo(42);
    await settle();
    expect(mockClient.seek).toHaveBeenCalledWith({ position: 42 });
    expect(activeRemoteTarget()?.getCurrentTime()).toBeGreaterThanOrEqual(42);
  });

  it("restarts the track rather than going back when past the threshold", async () => {
    await startSession();
    status("playing", { streamPosition: 30 });
    activeRemoteTarget()?.skipPrevious();
    await settle();
    expect(mockQueueState.previous).not.toHaveBeenCalled();
    expect(mockClient.seek).toHaveBeenCalledWith({ position: 0 });
  });

  it("follows the receiver's progress between statuses", async () => {
    await startSession();
    status("playing", { streamPosition: 10 });
    mockProgressListener?.(20, 100);
    expect(
      activeRemoteTarget()?.readSnapshot().currentTime,
    ).toBeGreaterThanOrEqual(20);
    expect(activeRemoteTarget()?.readSnapshot().duration).toBe(100);
  });
});

describe("ending a session", () => {
  it("brings playback back to this device from the receiver's position", async () => {
    await startSession();
    status("playing", { streamPosition: 40 });
    mockSessionHandlers.ended?.(session);
    expect(useCastBase.getState().active).toBe(false);
    expect(activeRemoteTarget()).toBeNull();
    const [position, shouldPlay] = mockTakeOverFromRemote.mock.calls[0] as [
      number,
      boolean,
    ];
    expect(position).toBeGreaterThanOrEqual(40);
    expect(shouldPlay).toBe(true);
  });

  it("records where a podcast episode got to on the receiver", async () => {
    mockQueueState.queue = [
      {
        id: "ep1",
        source: "podcast",
        enclosureUrl: "https://feed/ep1.mp3",
        duration: 3000,
      },
    ];
    mockQueueState.currentIndex = 0;
    mockSessionHandlers.started?.(session);
    await settle();
    expect(lastLoad().mediaInfo.contentUrl).toBe("https://feed/ep1.mp3");
    status("playing", { streamPosition: 600, duration: 3000 });
    mockSessionHandlers.ended?.(session);
    expect(mockRecordPodcastProgress).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ep1" }),
      expect.any(Number),
      expect.objectContaining({ force: true }),
    );
  });

  it("hands playback back before asking the SDK to end, so the next output starts from a phone that owns it", async () => {
    await startSession();
    status("playing", { streamPosition: 40 });
    const order: string[] = [];
    mockTakeOverFromRemote.mockImplementation(() => order.push("takeover"));
    mockSessionManager.endCurrentSession.mockImplementation(async () => {
      order.push("end");
    });
    await castDisconnect();
    expect(order).toEqual(["takeover", "end"]);
    // The SDK's own callback then finds nothing left to do.
    mockSessionHandlers.ended?.(session);
    expect(mockTakeOverFromRemote).toHaveBeenCalledTimes(1);
  });

  it("keeps the receiver as the output while the SDK has the session on hold", async () => {
    await startSession();
    status("playing", { streamPosition: 40 });
    mockSessionHandlers.suspended?.(session);
    expect(useCastBase.getState().active).toBe(true);
    expect(useCastBase.getState().suspended).toBe(true);
    mockSessionHandlers.resumed?.(session);
    expect(useCastBase.getState().suspended).toBe(false);
    expect(mockClient.getMediaStatus).toHaveBeenCalled();
  });
});
