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
  positionMs: number;
  durationMs: number;
};

let mockStateListener: ((state: NativeState) => void) | null = null;
const mockNative = {
  search: jest.fn(async () => []),
  connect: jest.fn(async () => true),
  load: jest.fn(async () => true),
  play: jest.fn(async () => true),
  pause: jest.fn(async () => true),
  seek: jest.fn(async () => true),
  setVolume: jest.fn(async () => true),
  getVolume: jest.fn(async () => 30),
  disconnect: jest.fn(async () => true),
  addListener: jest.fn((_event: string, cb: (s: NativeState) => void) => {
    mockStateListener = cb;
    return {
      remove: () => {
        mockStateListener = null;
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

jest.mock("@/services/player", () => ({
  getCurrentTime: () => 0,
  isPlaying: () => true,
  pause: jest.fn(),
  takeOverFromRemote: jest.fn(),
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
const netState = { isCellular: false };
jest.mock("@/services/network", () => ({
  getEffectiveStreamingFormat: (format: string, cellularFormat: string) =>
    netState.isCellular && cellularFormat !== "same" ? cellularFormat : format,
}));

type Track = { id: string; duration?: number; suffix?: string };
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
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueState,
    subscribe: jest.fn(() => jest.fn()),
  },
}));

import { activeRemoteTarget } from "@/services/playback/remoteTarget";
import { castMime, upnpConnect, upnpDisconnect } from "@/services/upnp";
import { useUpnpBase } from "@/stores/upnp";

const device = {
  id: "uuid-1",
  name: "Kitchen",
  address: "192.168.1.50",
  isTV: false,
  verified: true,
};

const push = (
  playbackState: string,
  positionSec: number,
  durationSec: number,
) =>
  mockStateListener?.({
    playbackState,
    positionMs: positionSec * 1000,
    durationMs: durationSec * 1000,
  });

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
  mockNative.load.mockResolvedValue(true);
  mockNative.play.mockResolvedValue(true);
  mockNative.pause.mockResolvedValue(true);
  mockNative.seek.mockResolvedValue(true);
  mockNative.setVolume.mockResolvedValue(true);
  mockNative.getVolume.mockResolvedValue(30);
  mockNative.disconnect.mockResolvedValue(true);
  mockNative.addListener.mockImplementation(
    (_event: string, cb: (s: NativeState) => void) => {
      mockStateListener = cb;
      return {
        remove: () => {
          mockStateListener = null;
        },
      };
    },
  );
  mockStateListener = null;
  mockStreamingFormat.value = "raw";
  useUpnpBase.getState().__reset();
});

afterEach(async () => {
  if (useUpnpBase.getState().connected) await upnpDisconnect();
});

describe("upnp session", () => {
  it("connects, loads the current track and marks the store connected", async () => {
    await connect();
    expect(mockNative.connect).toHaveBeenCalledWith("uuid-1");
    expect(mockNative.load).toHaveBeenCalledTimes(1);
    const [url, info, autoplay] = mockNative.load.mock.calls[0] as unknown as [
      string,
      { mime: string; durationSec?: number },
      boolean,
    ];
    expect(url).toContain("/rest/stream?id=t1");
    expect(info.mime).toBe("audio/flac");
    expect(autoplay).toBe(true);
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
    mockNative.load.mockClear();
    push("STOPPED", 95, 100);
    // next() deliberately keeps the same index under repeat-one, so relying on
    // it would leave the renderer silent at the end of the song.
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(mockNative.load).toHaveBeenCalledTimes(1);
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

describe("remote target", () => {
  it("restarts the track rather than going back when past the threshold", async () => {
    await connect();
    push("PLAYING", 30, 100);
    activeRemoteTarget()?.skipPrevious();
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
