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

type NativeState = {
  playbackState: string;
  transportStatus?: string;
  positionMs: number;
  durationMs: number;
  trackUri?: string;
  generation?: number;
};
type LoadResult = {
  ok: boolean;
  reason?: string | null;
  generation: number;
  trackUri: string;
};

let mockStateListener: ((state: NativeState) => void) | null = null;
let mockLostListener: ((event: { deviceId: string }) => void) | null = null;
// Registered once, the first time discovery runs.
let mockDeviceListener: ((device: unknown) => void) | null = null;
// The native side stamps every report with the generation of the load whose
// track the renderer held; the stub echoes back whatever the last load asked for.
const lastLoadGeneration = () => {
  const call = mockNative.load.mock.calls.at(-1) as unknown[] | undefined;
  return (call?.[4] as number | undefined) ?? 0;
};
const loadOk = async (...args: unknown[]): Promise<LoadResult> => ({
  ok: true,
  generation: args[4] as number,
  trackUri: args[0] as string,
});
const mockNative = {
  search: jest.fn(async (): Promise<unknown[]> => []),
  connect: jest.fn(async () => true),
  load: jest.fn(loadOk),
  play: jest.fn(async () => true),
  pause: jest.fn(async () => ({ ok: true, stoppedInstead: false })),
  seek: jest.fn(async () => true),
  pollNow: jest.fn(async () => undefined),
  setVolume: jest.fn(async () => true),
  getVolume: jest.fn(async () => 30),
  disconnect: jest.fn(async () => true),
  startListening: jest.fn(async () => true),
  stopListening: jest.fn(async () => undefined),
  describe: jest.fn(async () => null as unknown),
  probe: jest.fn(async () => null as unknown),
  addListener: jest.fn((event: string, cb: unknown) => {
    if (event === "state") mockStateListener = cb as typeof mockStateListener;
    if (event === "lost") mockLostListener = cb as typeof mockLostListener;
    if (event === "device")
      mockDeviceListener = cb as typeof mockDeviceListener;
    return {
      remove: () => {
        if (event === "state") mockStateListener = null;
        if (event === "lost") mockLostListener = null;
      },
    };
  }),
};
// A getter, not `default: mockNative`: jest hoists this factory above the
// imports, so a direct reference would capture the binding before it exists.
jest.mock("@/modules/upnp-cast", () => ({
  __esModule: true,
  get default() {
    return mockNative;
  },
  isUpnpAvailable: () => true,
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

const localPlayer = { playing: true };
const mockTakeOverFromRemote = jest.fn();
jest.mock("@/services/player", () => ({
  getCurrentTime: () => 0,
  isPlaying: () => localPlayer.playing,
  pause: jest.fn(),
  takeOverFromRemote: (...args: unknown[]) => mockTakeOverFromRemote(...args),
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ serverType: "navidrome" }) },
  currentAuthScope: () => "scope",
  registerLogoutHandler: jest.fn(),
}));

const mockJukebox = { active: false };
jest.mock("@/stores/jukebox", () => ({
  __esModule: true,
  default: { getState: () => mockJukebox },
}));

const mockCapabilities = { remoteStreamableUrl: true };
jest.mock("@/services/backend/capabilities", () => ({
  getCapabilities: () => mockCapabilities,
}));

const mockStreamingFormat = { value: "raw" as string };
const mockCellularStreamingFormat = { value: "same" as string };
jest.mock("@/stores/app", () => ({
  useAppBase: {
    getState: () => ({
      streamingFormat: mockStreamingFormat.value,
      cellularStreamingFormat: mockCellularStreamingFormat.value,
    }),
  },
}));

// Stand-in for the real resolver (covered in network.test.ts): "same" and Wi-Fi
// fall through to the Wi-Fi format, cellular takes the cellular pick.
const netState = { isCellular: false, type: "wifi" };
const mockConnectionListeners = new Set<(type: string) => void>();
jest.mock("@/services/network", () => ({
  getEffectiveStreamingFormat: (format: string, cellularFormat: string) =>
    netState.isCellular && cellularFormat !== "same" ? cellularFormat : format,
  getConnectionType: () => netState.type,
  subscribeConnectionType: (cb: (type: string) => void) => {
    mockConnectionListeners.add(cb);
    return () => mockConnectionListeners.delete(cb);
  },
}));

type Track = { id: string; duration?: number; suffix?: string; title?: string };
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
// Moves the queue the way the real store does: the index changes and every
// subscriber hears about it synchronously.
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

import { activeRemoteTarget } from "@/services/playback/remoteTarget";
import {
  castMime,
  initUpnpOnLaunch,
  reattach,
  takeOverLocally,
  upnpConnect,
  upnpDisconnect,
  upnpRelease,
  upnpStartDiscovery,
  upnpStopDiscovery,
} from "@/services/upnp";
import { useUpnpBase } from "@/stores/upnp";

const device = {
  id: "uuid-1",
  name: "Kitchen",
  address: "192.168.1.50",
  location: "http://192.168.1.50:1400/xml/device_description.xml",
  isTV: false,
};

const push = (
  playbackState: string,
  positionSec: number,
  durationSec: number,
  extra: Partial<NativeState> = {},
) =>
  mockStateListener?.({
    playbackState,
    positionMs: positionSec * 1000,
    durationMs: durationSec * 1000,
    generation: lastLoadGeneration(),
    ...extra,
  });

// Lets the transport command that was just issued resolve, so its optimistic
// state has been confirmed (or undone) before the next assertion.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// A 100s track: the end-of-track window is max(5, 10%) = 10s, so anything from
// 90s on counts as having finished.
const TRACK = { id: "t1", duration: 100, suffix: "flac" };

async function connect() {
  mockQueueState.queue = [TRACK, { id: "t2", duration: 100 }];
  mockQueueState.currentIndex = 0;
  mockQueueState.repeatMode = "off";
  await upnpConnect(device);
}

beforeEach(async () => {
  jest.clearAllMocks();
  // clearAllMocks drops implementations too, so the native stubs are re-armed
  // here rather than only at their declaration.
  mockNative.search.mockResolvedValue([]);
  mockNative.connect.mockResolvedValue(true);
  mockNative.load.mockImplementation(loadOk);
  mockNative.play.mockResolvedValue(true);
  mockNative.pause.mockResolvedValue({ ok: true, stoppedInstead: false });
  mockNative.seek.mockResolvedValue(true);
  mockNative.pollNow.mockResolvedValue(undefined);
  mockNative.setVolume.mockResolvedValue(true);
  mockNative.getVolume.mockResolvedValue(30);
  mockNative.disconnect.mockResolvedValue(true);
  mockNative.describe.mockResolvedValue(null);
  mockNative.probe.mockResolvedValue(null);
  mockNative.addListener.mockImplementation((event: string, cb: unknown) => {
    if (event === "state") mockStateListener = cb as typeof mockStateListener;
    if (event === "lost") mockLostListener = cb as typeof mockLostListener;
    if (event === "device")
      mockDeviceListener = cb as typeof mockDeviceListener;
    return {
      remove: () => {
        if (event === "state") mockStateListener = null;
        if (event === "lost") mockLostListener = null;
      },
    };
  });
  mockStateListener = null;
  mockLostListener = null;
  mockQueueSubscribers.clear();
  mockStreamingFormat.value = "raw";
  localPlayer.playing = true;
  mockJukebox.active = false;
  mockCapabilities.remoteStreamableUrl = true;
  netState.type = "wifi";
  mockConnectionListeners.clear();
  useUpnpBase.getState().__reset();
});

afterEach(async () => {
  if (useUpnpBase.getState().connected) await upnpDisconnect();
  // A prompt raised but never answered would otherwise leak its probe into
  // the next test.
  await upnpRelease();
});

describe("upnp session", () => {
  it("remembers the renderer and the track it was given", async () => {
    await connect();
    const session = useUpnpBase.getState().session;
    expect(session).toMatchObject({
      deviceId: "uuid-1",
      deviceName: "Kitchen",
      location: device.location,
      trackId: "t1",
    });
    expect(session?.trackUrl).toContain("/rest/stream?id=t1");
  });

  it("forgets the session on disconnect", async () => {
    await connect();
    await upnpDisconnect();
    expect(useUpnpBase.getState().session).toBeNull();
    expect(mockTakeOverFromRemote).toHaveBeenCalled();
  });

  it("release stops the renderer without moving playback to this device", async () => {
    await connect();
    await upnpRelease();
    expect(mockNative.disconnect).toHaveBeenCalled();
    expect(useUpnpBase.getState().connected).toBe(false);
    expect(useUpnpBase.getState().session).toBeNull();
    expect(mockTakeOverFromRemote).not.toHaveBeenCalled();
  });

  it("connects, loads the current track and marks the store connected", async () => {
    await connect();
    expect(mockNative.connect).toHaveBeenCalledWith("uuid-1");
    expect(mockNative.load).toHaveBeenCalledTimes(1);
    const [url, info, autoplay, startPositionMs, generation] = mockNative.load
      .mock.calls[0] as unknown as [
      string,
      { mime: string; durationSec?: number },
      boolean,
      number,
      number,
    ];
    expect(url).toContain("/rest/stream?id=t1");
    expect(info.mime).toBe("audio/flac");
    expect(autoplay).toBe(true);
    expect(startPositionMs).toBe(0);
    expect(generation).toBe(1);
    expect(useUpnpBase.getState().connected).toBe(true);
    expect(useUpnpBase.getState().deviceName).toBe("Kitchen");
  });

  it("adopts the renderer's own volume rather than imposing one", async () => {
    mockNative.getVolume.mockResolvedValueOnce(80);
    await connect();
    expect(useUpnpBase.getState().volume).toBeCloseTo(0.8);
  });
});

describe("end-of-track inference", () => {
  it("advances the queue when a played-through track stops near the end", async () => {
    await connect();
    push("PLAYING", 95, 100);
    push("STOPPED", 95, 100);
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
  });

  it("does not advance when the user paused and the renderer reports STOPPED", async () => {
    await connect();
    push("PLAYING", 40, 100);
    // Some renderers have no Pause and answer a pause with Stop. That must not
    // read as the track having finished, or pausing would skip a song.
    activeRemoteTarget()?.pause();
    await settle();
    push("STOPPED", 40, 100);
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("does not advance on the STOPPED a renderer reports while loading", async () => {
    await connect();
    // No PLAYING has been seen yet: this is the gap between accepting the URI
    // and starting it, not an ending.
    push("STOPPED", 0, 0);
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("does not advance when playback stops far from the end", async () => {
    await connect();
    push("PLAYING", 30, 100);
    push("STOPPED", 30, 100);
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("shows a track stopped from the renderer's own remote as paused where it was", async () => {
    await connect();
    push("PLAYING", 30, 100);
    // A stopped renderer reports its position as zero; the seek bar must not.
    push("STOPPED", 0, 100);
    const snapshot = activeRemoteTarget()?.readSnapshot();
    expect(snapshot?.playing).toBe(false);
    expect(snapshot?.currentTime).toBeCloseTo(30, 0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(activeRemoteTarget()?.readSnapshot().currentTime).toBeCloseTo(30, 0);
  });

  it("seeks back to where the renderer was stopped when play is pressed again", async () => {
    await connect();
    push("PLAYING", 30, 100);
    push("STOPPED", 0, 100);
    activeRemoteTarget()?.play();
    await settle();
    expect(mockNative.play).toHaveBeenCalledWith(30000);
  });

  it("forgets a pending resume once the renderer is seen playing on its own", async () => {
    await connect();
    push("PLAYING", 30, 100);
    push("STOPPED", 0, 100);
    // Someone pressed play on the renderer itself: it restarted from the top.
    push("PLAYING", 2, 100);
    mockNative.seek.mockClear();
    activeRemoteTarget()?.seekTo(50);
    await settle();
    expect(mockNative.seek).toHaveBeenCalledWith(50000);
  });

  it("advances only once when STOPPED repeats across polls", async () => {
    await connect();
    push("PLAYING", 95, 100);
    push("STOPPED", 95, 100);
    push("STOPPED", 95, 100);
    push("STOPPED", 95, 100);
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
  });

  it("advances when the renderer reports no duration at all", async () => {
    // Nothing to compare against, so a stop after playing is taken at face
    // value: advancing beats stalling forever on one track.
    mockQueueState.queue = [{ id: "t1" }, { id: "t2" }];
    mockQueueState.currentIndex = 0;
    mockQueueState.repeatMode = "off";
    await upnpConnect(device);
    push("PLAYING", 10, 0);
    push("STOPPED", 10, 0);
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
  });

  it("reloads the same track on repeat-one instead of moving the queue", async () => {
    await connect();
    mockQueueState.repeatMode = "one";
    push("PLAYING", 95, 100);
    push("STOPPED", 95, 100);
    // next() deliberately keeps the same index under repeat-one, so relying on
    // it would leave the renderer silent at the end of the song.
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockNative.load).toHaveBeenCalledTimes(2);
  });

  it("stops rather than advancing past the end of the queue", async () => {
    await connect();
    mockQueueState.currentIndex = 1;
    push("PLAYING", 95, 100);
    mockNative.pause.mockClear();
    push("STOPPED", 95, 100);
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockNative.pause).toHaveBeenCalled();
  });
});

describe("keeping the story straight across a handover", () => {
  it("drops a report taken before the load the app last asked for", async () => {
    await connect();
    push("PLAYING", 95, 100);
    // The queue moves on; the renderer is handed t2 (generation 2).
    moveQueueTo(1);
    expect(mockNative.load).toHaveBeenCalledTimes(2);
    // A poll that was already in flight reports the old track ending. It is
    // stamped with the old generation and must not count as t2 ending.
    push("STOPPED", 95, 100, { generation: 1 });
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("does not skip the track it just loaded when the renderer stops the old one", async () => {
    await connect();
    push("PLAYING", 95, 100);
    moveQueueTo(1);
    await settle();
    // A real renderer goes PLAYING(old) -> STOPPED -> TRANSITIONING -> PLAYING(new),
    // and reports the old URI for a poll or two. None of that is t2 ending.
    const oldUri = "http://server/rest/stream?id=t1&u=x&t=y&s=q";
    push("PLAYING", 95, 100, { trackUri: oldUri });
    push("STOPPED", 95, 100, { trackUri: oldUri });
    push("TRANSITIONING", 0, 0, { trackUri: oldUri });
    expect(mockQueueState.next).not.toHaveBeenCalled();
    push("PLAYING", 1, 100, {
      trackUri: "http://server/rest/stream?id=t2&u=x&t=y&s=z",
    });
    expect(activeRemoteTarget()?.readSnapshot().playing).toBe(true);
  });

  it("does not advance on a STOPPED about a track the renderer no longer holds for us", async () => {
    await connect();
    push("PLAYING", 95, 100, {
      trackUri: "http://server/rest/stream?id=other&u=1",
    });
    push("STOPPED", 95, 100, {
      trackUri: "http://server/rest/stream?id=other&u=1",
    });
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("matches the renderer's URI by track id, not by the auth salt", async () => {
    await connect();
    push("PLAYING", 95, 100, {
      trackUri: "http://server/rest/stream?id=t1&u=x&t=other&s=salt",
    });
    push("STOPPED", 95, 100, {
      trackUri: "http://server/rest/stream?id=t1&u=x&t=other&s=salt",
    });
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
  });

  it("treats a transport error as a failed track, not an ending", async () => {
    await connect();
    push("PLAYING", 10, 100);
    push("STOPPED", 10, 100, { transportStatus: "ERROR_OCCURRED" });
    // Nobody pressed anything, so the next track gets one try.
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
    expect(mockRaiseNotice).not.toHaveBeenCalled();
  });

  it("holds the last track and says so on a transport error, rather than skipping past the end", async () => {
    await connect();
    moveQueueTo(1);
    await settle();
    push("PLAYING", 10, 100);
    push("STOPPED", 10, 100, { transportStatus: "ERROR_OCCURRED" });
    // `next()` past the tail would drop the current index and blank the player.
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockRaiseNotice).toHaveBeenCalledWith(
      "REMOTE_TRACK_REFUSED",
      expect.objectContaining({ name: "Kitchen" }),
    );
  });

  it("ignores a load the renderer never saw because a newer one overtook it", async () => {
    await connect();
    mockNative.load.mockResolvedValueOnce({
      ok: false,
      reason: "superseded",
      generation: 2,
      trackUri: "",
    });
    moveQueueTo(1);
    await settle();
    expect(mockRaiseNotice).not.toHaveBeenCalled();
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });
});

describe("a track the renderer will not take", () => {
  const refuse = () =>
    mockNative.load.mockImplementationOnce(async (...args: unknown[]) => ({
      ok: false,
      reason: "refused",
      generation: args[4] as number,
      trackUri: "",
    }));

  it("holds the queue where it is and tells the listener when they chose the track", async () => {
    await connect();
    refuse();
    moveQueueTo(1);
    await settle();
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockRaiseNotice).toHaveBeenCalledWith(
      "REMOTE_TRACK_REFUSED",
      expect.objectContaining({ name: "Kitchen" }),
    );
    expect(activeRemoteTarget()?.readSnapshot().playing).toBe(false);
    expect(useUpnpBase.getState().connected).toBe(true);
  });

  it("does not blame the track when the renderer simply did not answer", async () => {
    await connect();
    mockNative.load.mockImplementationOnce(async (...args: unknown[]) => ({
      ok: false,
      reason: "unreachable",
      generation: args[4] as number,
      trackUri: "",
    }));
    moveQueueTo(1);
    await settle();
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockRaiseNotice).not.toHaveBeenCalled();
    expect(activeRemoteTarget()?.readSnapshot().playing).toBe(false);
  });

  it("skips one bad track on its own when the queue advanced by itself, then stops", async () => {
    mockQueueState.queue = [
      TRACK,
      { id: "t2", duration: 100 },
      { id: "t3", duration: 100 },
      { id: "t4", duration: 100 },
    ];
    mockQueueState.currentIndex = 0;
    mockQueueState.repeatMode = "off";
    await upnpConnect(device);
    mockQueueState.next.mockImplementation(() =>
      moveQueueTo((mockQueueState.currentIndex ?? 0) + 1),
    );
    push("PLAYING", 95, 100);
    refuse();
    refuse();
    push("STOPPED", 95, 100);
    await settle();
    await settle();
    // t1 ended -> t2 refused -> t3 tried once more -> refused -> hold and say so.
    expect(mockQueueState.currentIndex).toBe(2);
    expect(mockRaiseNotice).toHaveBeenCalledTimes(1);
  });

  it("does not resume this device on a failed connect from a state the renderer never reached", async () => {
    mockQueueState.queue = [TRACK];
    mockQueueState.currentIndex = 0;
    localPlayer.playing = true;
    refuse();
    const ok = await upnpConnect(device);
    expect(ok).toBe(false);
    expect(useUpnpBase.getState().connected).toBe(false);
    // The phone was playing before the attempt, so it plays again after it.
    expect(mockTakeOverFromRemote).toHaveBeenCalledWith(0, true);
  });
});

describe("transport commands", () => {
  it("shows the pause at once and ignores the poll that was already on its way", async () => {
    await connect();
    push("PLAYING", 30, 100);
    let resolvePause: (r: { ok: boolean; stoppedInstead: boolean }) => void =
      () => {};
    mockNative.pause.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePause = resolve;
        }),
    );
    activeRemoteTarget()?.pause();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    // Taken before the pause landed; contradicts it, and is not believed.
    push("PLAYING", 31, 100);
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    resolvePause({ ok: true, stoppedInstead: false });
    await settle();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
  });

  it("undoes the guess when the renderer refuses the command", async () => {
    await connect();
    push("PLAYING", 30, 100);
    mockNative.pause.mockResolvedValueOnce({
      ok: false,
      stoppedInstead: false,
    });
    activeRemoteTarget()?.pause();
    await settle();
    expect(activeRemoteTarget()?.isPlaying()).toBe(true);
  });

  it("shows where a handover made while paused will resume, not the renderer's zero", async () => {
    localPlayer.playing = false;
    mockQueueState.queue = [TRACK];
    mockQueueState.currentIndex = 0;
    jest
      .spyOn(jest.requireMock("@/services/player"), "getCurrentTime")
      .mockReturnValue(16);
    try {
      await upnpConnect(device);
      push("PAUSED_PLAYBACK", 0, 100);
      expect(activeRemoteTarget()?.readSnapshot().currentTime).toBeCloseTo(
        16,
        0,
      );
      activeRemoteTarget()?.play();
      await settle();
      expect(mockNative.play).toHaveBeenCalledWith(16000);
    } finally {
      localPlayer.playing = true;
    }
  });

  it("seeks back on resume when the renderer had to stop instead of pausing", async () => {
    await connect();
    push("PLAYING", 40, 100);
    mockNative.pause.mockResolvedValueOnce({ ok: true, stoppedInstead: true });
    activeRemoteTarget()?.pause();
    await settle();
    activeRemoteTarget()?.play();
    await settle();
    expect(mockNative.play).toHaveBeenCalledWith(40000);
  });

  it("toggles from the state it just asked for, not the last poll", async () => {
    await connect();
    push("PLAYING", 30, 100);
    activeRemoteTarget()?.togglePlayPause();
    activeRemoteTarget()?.togglePlayPause();
    await settle();
    expect(mockNative.pause).toHaveBeenCalledTimes(1);
    expect(mockNative.play).toHaveBeenCalledTimes(1);
  });
});

describe("a renderer that stops answering", () => {
  it("brings playback back to this device, paused, and says so", async () => {
    await connect();
    push("PLAYING", 50, 100);
    mockLostListener?.({ deviceId: "uuid-1" });
    expect(useUpnpBase.getState().connected).toBe(false);
    expect(mockTakeOverFromRemote).toHaveBeenCalledWith(
      expect.any(Number),
      false,
    );
    const [position] = mockTakeOverFromRemote.mock.calls[0] as [number];
    expect(position).toBeGreaterThanOrEqual(50);
    expect(mockRaiseNotice).toHaveBeenCalledWith("REMOTE_LOST", {
      name: "Kitchen",
    });
  });

  it("resumes from the last position the renderer confirmed, not the clock that ran on", async () => {
    await connect();
    push("PLAYING", 50, 100);
    // The native side waits several seconds of silence before giving up; the
    // seek bar kept moving through them, but the renderer did not.
    await new Promise((resolve) => setTimeout(resolve, 60));
    mockLostListener?.({ deviceId: "uuid-1" });
    const [position] = mockTakeOverFromRemote.mock.calls[0] as [number];
    expect(position).toBe(50);
  });
});

describe("finding renderers", () => {
  it("lists a renderer the moment the native side reports it, before the search ends", async () => {
    upnpStartDiscovery();
    expect(mockDeviceListener).not.toBeNull();
    mockDeviceListener?.({
      ...device,
      id: "uuid-9",
      name: "Bedroom",
      address: "192.168.1.9",
    });
    expect(useUpnpBase.getState().devices.map((d) => d.name)).toContain(
      "Bedroom",
    );
  });

  it("asks renderers played to before for themselves directly when the picker opens", async () => {
    await connect();
    await upnpDisconnect();
    expect(useUpnpBase.getState().seen[0]?.id).toBe("uuid-1");
    mockNative.describe.mockResolvedValueOnce({
      ...device,
      name: "Kitchen (back)",
    });
    upnpStartDiscovery();
    await settle();
    expect(mockNative.describe).toHaveBeenCalledWith("uuid-1", device.location);
    expect(mockNative.startListening).toHaveBeenCalled();
    expect(useUpnpBase.getState().devices.map((d) => d.name)).toContain(
      "Kitchen (back)",
    );
    upnpStopDiscovery();
    expect(mockNative.stopListening).toHaveBeenCalled();
  });

  it("drops a listed renderer that no longer answers at its own address", async () => {
    upnpStartDiscovery();
    mockDeviceListener?.({ ...device, id: "uuid-9", name: "Bedroom" });
    mockNative.describe.mockResolvedValue(null);
    upnpStartDiscovery();
    await settle();
    expect(mockNative.describe).toHaveBeenCalledWith("uuid-9", device.location);
    expect(useUpnpBase.getState().devices).toHaveLength(0);
  });

  it("keeps the renderer in use listed, whatever the probe says", async () => {
    await connect();
    mockNative.describe.mockResolvedValue(null);
    upnpStartDiscovery();
    await settle();
    expect(useUpnpBase.getState().devices.map((d) => d.id)).toContain("uuid-1");
  });

  it("lists the renderer in use straight away on a process that has no list yet", async () => {
    await connect();
    // A restart keeps the session and what was played to, not the scan results.
    useUpnpBase.setState({ devices: [] });
    upnpStartDiscovery();
    expect(useUpnpBase.getState().devices.map((d) => d.name)).toEqual([
      "Kitchen",
    ]);
  });

  it("forgets a renderer that is listed but cannot be connected to", async () => {
    upnpStartDiscovery();
    mockDeviceListener?.({ ...device, id: "uuid-9", name: "Bedroom" });
    mockNative.connect.mockResolvedValueOnce(false);
    const connected = await upnpConnect({ ...device, id: "uuid-9" });
    expect(connected).toBe(false);
    expect(useUpnpBase.getState().devices).toHaveLength(0);
  });
});

describe("remote target", () => {
  it("restarts the track rather than going back when past the threshold", async () => {
    await connect();
    push("PLAYING", 30, 100);
    activeRemoteTarget()?.skipPrevious();
    await settle();
    expect(mockQueueState.previous).not.toHaveBeenCalled();
    expect(mockNative.seek).toHaveBeenCalledWith(0);
  });

  it("goes to the previous track when near the start", async () => {
    await connect();
    mockQueueState.currentIndex = 1;
    push("PLAYING", 1, 100);
    activeRemoteTarget()?.skipPrevious();
    expect(mockQueueState.previous).toHaveBeenCalledTimes(1);
  });

  it("reports a position that advances between polls", async () => {
    await connect();
    push("PLAYING", 10, 100);
    const first = activeRemoteTarget()?.readSnapshot().currentTime ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 60));
    const second = activeRemoteTarget()?.readSnapshot().currentTime ?? 0;
    // The renderer only reports once a second; a seek bar that stepped at that
    // rate would visibly stutter.
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(11);
  });

  it("never reports a position past the end of the track", async () => {
    await connect();
    push("PLAYING", 100, 100);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(
      activeRemoteTarget()?.readSnapshot().currentTime,
    ).toBeLessThanOrEqual(100);
  });

  it("can be released for another output without handing playback back here", async () => {
    await connect();
    push("PLAYING", 30, 100);
    await activeRemoteTarget()?.release();
    expect(mockNative.disconnect).toHaveBeenCalled();
    expect(mockTakeOverFromRemote).not.toHaveBeenCalled();
    expect(activeRemoteTarget()).toBeNull();
  });
});

describe("resuming after a restart", () => {
  const savedSession = {
    deviceId: "uuid-1",
    deviceName: "Kitchen",
    address: "192.168.1.50",
    location: device.location,
    trackId: "t1",
    trackUrl: "http://server/rest/stream?id=t1&u=x&t=y&s=z",
  };
  const probe = (playbackState: string, trackUri = savedSession.trackUrl) => ({
    playbackState,
    positionMs: 42_000,
    durationMs: 100_000,
    trackUri,
  });

  beforeEach(() => {
    mockQueueState.queue = [TRACK, { id: "t2", duration: 100 }];
    mockQueueState.currentIndex = 0;
    localPlayer.playing = false;
    useUpnpBase.getState().setSession(savedSession);
    mockNative.describe.mockResolvedValue(device);
  });

  const expectDropped = () => {
    expect(useUpnpBase.getState().pendingResume).toBe(false);
    expect(useUpnpBase.getState().session).toBeNull();
    expect(mockNative.connect).not.toHaveBeenCalled();
    expect(mockNative.disconnect).not.toHaveBeenCalled();
  };

  it("prompts when the renderer is still playing our track", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    expect(useUpnpBase.getState().pendingResume).toBe(true);
    expect(useUpnpBase.getState().connected).toBe(false);
    expect(mockNative.describe).toHaveBeenCalledWith("uuid-1", device.location);
    expect(mockNative.search).not.toHaveBeenCalled();
  });

  it("prompts when the renderer holds our track paused, as a swipe-away leaves it", async () => {
    mockNative.probe.mockResolvedValue(probe("PAUSED_PLAYBACK"));
    await initUpnpOnLaunch();
    expect(useUpnpBase.getState().pendingResume).toBe(true);
  });

  it("falls back to the duration when the renderer does not report what it holds", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING", ""));
    await initUpnpOnLaunch();
    expect(useUpnpBase.getState().pendingResume).toBe(true);
  });

  it("drops the session when a renderer reporting no URI holds something of another length", async () => {
    mockNative.probe.mockResolvedValue({
      ...probe("PLAYING", ""),
      durationMs: 245_000,
    });
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("drops the session when a renderer reports neither URI nor duration", async () => {
    mockNative.probe.mockResolvedValue({
      ...probe("PLAYING", ""),
      durationMs: 0,
    });
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("matches the URI even when the renderer hands it back escaped", async () => {
    mockNative.probe.mockResolvedValue(
      probe(
        "PLAYING",
        " http://server/rest/stream?id=t1&amp;u=x&amp;t=y&amp;s=z ",
      ),
    );
    await initUpnpOnLaunch();
    expect(useUpnpBase.getState().pendingResume).toBe(true);
  });

  it("drops a renderer that has moved on to something else without touching it", async () => {
    mockNative.probe.mockResolvedValue(
      probe("PLAYING", "http://elsewhere/other.mp3"),
    );
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("drops an idle renderer: the track ended and there is nothing to resume", async () => {
    mockNative.probe.mockResolvedValue(probe("STOPPED"));
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("drops the session when the renderer cannot be found", async () => {
    mockNative.describe.mockResolvedValue(null);
    await initUpnpOnLaunch();
    expect(mockNative.search).toHaveBeenCalled();
    expectDropped();
  });

  it("finds a renderer by UDN through a search when its address changed", async () => {
    mockNative.describe.mockResolvedValue(null);
    mockNative.search.mockResolvedValue([
      { ...device, address: "192.168.1.77" },
    ]);
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    expect(useUpnpBase.getState().pendingResume).toBe(true);
  });

  it("does not search for a renderer that never gave a UDN", async () => {
    useUpnpBase.getState().setSession({
      ...savedSession,
      deviceId: savedSession.address,
    });
    mockNative.describe.mockResolvedValue(null);
    await initUpnpOnLaunch();
    expect(mockNative.search).not.toHaveBeenCalled();
    expectDropped();
  });

  it("drops the session off Wi-Fi", async () => {
    netState.type = "cellular";
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    expect(mockNative.describe).not.toHaveBeenCalled();
    expectDropped();
  });

  it("waits for the network to be known before deciding", async () => {
    netState.type = "unknown";
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    const launch = initUpnpOnLaunch();
    await Promise.resolve();
    expect(mockNative.describe).not.toHaveBeenCalled();
    for (const cb of mockConnectionListeners) cb("wifi");
    await launch;
    expect(useUpnpBase.getState().pendingResume).toBe(true);
  });

  it("does not prompt when the session was replaced while the network was being asked", async () => {
    netState.type = "unknown";
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    const launch = initUpnpOnLaunch();
    await Promise.resolve();
    useUpnpBase.getState().setSession(null);
    for (const cb of mockConnectionListeners) cb("wifi");
    await launch;
    expect(useUpnpBase.getState().pendingResume).toBe(false);
    expect(useUpnpBase.getState().session).toBeNull();
    await reattach();
    expect(mockNative.connect).not.toHaveBeenCalled();
  });

  it("leaves another scope's session alone when the check ends in a drop", async () => {
    netState.type = "unknown";
    mockNative.describe.mockResolvedValue(null);
    const otherScopes = { ...savedSession, deviceId: "uuid-9", trackId: "t9" };
    const launch = initUpnpOnLaunch();
    await Promise.resolve();
    useUpnpBase.getState().setSession(otherScopes);
    for (const cb of mockConnectionListeners) cb("wifi");
    await launch;
    expect(useUpnpBase.getState().pendingResume).toBe(false);
    expect(useUpnpBase.getState().session).toBe(otherScopes);
  });

  it("release withdraws a pending resume prompt", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    expect(useUpnpBase.getState().pendingResume).toBe(true);
    await upnpRelease();
    expect(useUpnpBase.getState().pendingResume).toBe(false);
    expect(useUpnpBase.getState().session).toBeNull();
    await reattach();
    expect(mockNative.connect).not.toHaveBeenCalled();
  });

  it("drops the session when the queue no longer sits on the track it held", async () => {
    mockQueueState.currentIndex = 1;
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    expect(mockNative.describe).not.toHaveBeenCalled();
    expectDropped();
  });

  it("stands down while a jukebox session is active", async () => {
    mockJukebox.active = true;
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("stands down on a server that cannot stream to a renderer", async () => {
    mockCapabilities.remoteStreamableUrl = false;
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("does not prompt when the user has already started playing here", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    localPlayer.playing = true;
    await initUpnpOnLaunch();
    expectDropped();
  });

  it("resume takes the renderer back from where it is, without reloading the track", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    await reattach();
    expect(mockNative.connect).toHaveBeenCalledWith("uuid-1");
    expect(mockNative.load).not.toHaveBeenCalled();
    expect(useUpnpBase.getState().connected).toBe(true);
    expect(useUpnpBase.getState().session?.trackId).toBe("t1");
    const target = activeRemoteTarget();
    expect(target?.id).toBe("upnp");
    expect(target?.isPlaying()).toBe(true);
    expect(target?.getCurrentTime()).toBeCloseTo(42, 0);
  });

  it("resume seeds the end-of-track inference so the track's ending still advances", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    await reattach();
    push("STOPPED", 96, 100);
    expect(mockQueueState.next).toHaveBeenCalled();
  });

  it("resume of a paused renderer reports it paused", async () => {
    mockNative.probe.mockResolvedValue(probe("PAUSED_PLAYBACK"));
    await initUpnpOnLaunch();
    await reattach();
    expect(activeRemoteTarget()?.isPlaying()).toBe(false);
    push("STOPPED", 96, 100);
    expect(mockQueueState.next).not.toHaveBeenCalled();
  });

  it("play here stops the renderer and continues locally from its position", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    await takeOverLocally();
    expect(mockNative.connect).toHaveBeenCalledWith("uuid-1");
    expect(mockNative.disconnect).toHaveBeenCalled();
    expect(useUpnpBase.getState().connected).toBe(false);
    expect(useUpnpBase.getState().session).toBeNull();
    expect(mockTakeOverFromRemote).toHaveBeenCalledWith(42, true);
  });

  it("play here on a paused renderer stays paused on this device", async () => {
    mockNative.probe.mockResolvedValue(probe("PAUSED_PLAYBACK"));
    await initUpnpOnLaunch();
    await takeOverLocally();
    expect(mockTakeOverFromRemote).toHaveBeenCalledWith(42, false);
  });

  it("falls back to this device when the renderer refuses the reconnection", async () => {
    mockNative.probe.mockResolvedValue(probe("PLAYING"));
    await initUpnpOnLaunch();
    mockNative.connect.mockResolvedValue(false);
    await reattach();
    expect(useUpnpBase.getState().connected).toBe(false);
    expect(useUpnpBase.getState().session).toBeNull();
    expect(mockTakeOverFromRemote).toHaveBeenCalledWith(42, true);
  });
});

describe("castMime", () => {
  beforeEach(() => {
    mockCellularStreamingFormat.value = "same";
    netState.isCellular = false;
  });

  it("uses the transcode target when the server is transcoding", () => {
    mockStreamingFormat.value = "mp3";
    // The source is FLAC but MP3 is what will arrive, and the renderer decides
    // from what it is told, not from what the file used to be.
    expect(castMime({ id: "t", url: "u", suffix: "flac" })).toBe("audio/mpeg");
  });

  it("uses the source format when streaming untouched", () => {
    mockStreamingFormat.value = "raw";
    expect(castMime({ id: "t", url: "u", suffix: "flac" })).toBe("audio/flac");
    expect(castMime({ id: "t", url: "u", suffix: "mp3" })).toBe("audio/mpeg");
    expect(castMime({ id: "t", url: "u", suffix: "opus" })).toBe("audio/ogg");
    expect(castMime({ id: "t", url: "u", suffix: "m4a" })).toBe("audio/mp4");
    expect(castMime({ id: "t", url: "u", suffix: "wav" })).toBe("audio/wav");
  });

  it("follows the cellular format, like the stream URL does", () => {
    mockStreamingFormat.value = "raw";
    mockCellularStreamingFormat.value = "opus";
    netState.isCellular = true;
    // The URL asks for Opus on cellular, so announcing the source FLAC would
    // describe bytes the server is never going to send.
    expect(castMime({ id: "t", url: "u", suffix: "flac" })).toBe("audio/ogg");
  });

  it("is case-insensitive about the suffix", () => {
    mockStreamingFormat.value = "raw";
    expect(castMime({ id: "t", url: "u", suffix: "FLAC" })).toBe("audio/flac");
  });

  it("falls back to audio rather than letting the renderer guess", () => {
    mockStreamingFormat.value = "raw";
    // Guessing is what makes a renderer announce a track as video and refuse it.
    expect(castMime({ id: "t", url: "u", suffix: "xyz" })).toBe("audio/mpeg");
    expect(castMime({ id: "t", url: "u" })).toBe("audio/mpeg");
  });
});
