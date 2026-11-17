const mockSetQueue = jest.fn();
const mockSetQueueIndex = jest.fn();
const mockSetPlaybackState = jest.fn();
const mockSetError = jest.fn();
const mockSetPlayerButtons = jest.fn();
const mockStopProgress = jest.fn();
const mockSubscribeProgress = jest.fn((_cb: () => void) => mockStopProgress);
let mockCarConnected = false;
let mockOnline = true;
let mockCarListener: ((connected: boolean) => void) | undefined;
let mockQueueListener: ((state: object, prev: object) => void) | undefined;
let mockQueueState: {
  queue: { id: string }[];
  currentIndex: number | null;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
  getCurrent: () => { id: string; isRadio?: boolean } | null;
};
let mockSnapshot = { playing: true, buffering: false, currentTime: 0 };

jest.mock("@/services/carAuto/bridge", () => ({
  CarAutoBridge: {
    available: true,
    setQueue: (payload: unknown) => mockSetQueue(payload),
    setQueueIndex: (index: number) => mockSetQueueIndex(index),
    setPlaybackState: (state: unknown) => mockSetPlaybackState(state),
    setNowPlaying: jest.fn(),
    setPlayerButtons: (buttons: unknown) => mockSetPlayerButtons(buttons),
    setError: (error: unknown) => mockSetError(error),
  },
}));
jest.mock("@/services/carAuto/connection", () => ({
  isCarConnected: () => mockCarConnected,
  subscribeCarConnection: (listener: (connected: boolean) => void) => {
    mockCarListener = listener;
  },
}));
jest.mock("@/hooks/player/playbackSnapshot", () => ({
  getPlaybackSnapshot: () => mockSnapshot,
  subscribePlaybackProgress: (cb: () => void) => mockSubscribeProgress(cb),
  subscribePlaybackState: jest.fn(),
}));
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
  subscribeEffectiveOnline: jest.fn(),
}));
jest.mock("@/services/player", () => ({
  getCurrentFavorite: () => null,
  getPlaybackRateFor: () => 1,
  subscribeCurrentFavorite: jest.fn(),
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ isAuthenticated: true }),
    subscribe: jest.fn(),
  },
}));
jest.mock("@/stores/carAuto", () => ({
  carAutoSettings: () => ({
    playerButtons: { favorite: true, shuffle: true, repeat: true, radio: true },
  }),
  useCarAutoBase: { subscribe: jest.fn() },
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      isTrackDownloaded: () => false,
      getDownloadedTracksCount: () => 0,
    }),
  },
}));
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueState,
    subscribe: (listener: (state: object, prev: object) => void) => {
      mockQueueListener = listener;
    },
  },
}));
jest.mock("@/services/carAuto/nodes", () => ({
  t: (key: string) => key,
}));

type NowPlayingModule = typeof import("@/services/carAuto/nowPlaying");
let nowPlaying: NowPlayingModule;

const setQueue = (length: number, currentIndex: number) => {
  const queue = Array.from({ length }, (_, i) => ({ id: `t${i}` }));
  mockQueueState = {
    queue,
    currentIndex,
    shuffle: false,
    repeatMode: "off",
    getCurrent: () => queue[currentIndex] ?? null,
  };
};

beforeEach(() => {
  jest.resetModules();
  mockSetQueue.mockReset();
  mockSetQueueIndex.mockReset();
  mockSetPlaybackState.mockReset();
  mockSetError.mockReset();
  mockSetPlayerButtons.mockReset();
  mockStopProgress.mockReset();
  mockSubscribeProgress.mockClear();
  mockCarConnected = false;
  mockOnline = true;
  mockCarListener = undefined;
  mockQueueListener = undefined;
  mockSnapshot = { playing: true, buffering: false, currentTime: 0 };
  nowPlaying = require("@/services/carAuto/nowPlaying");
});

describe("queue window", () => {
  it("sends at most 50 tracks either side of the current one", () => {
    setQueue(500, 200);
    nowPlaying.pushQueue();

    const payload = mockSetQueue.mock.calls[0][0];
    expect(payload.offset).toBe(150);
    expect(payload.currentIndex).toBe(50);
    expect(payload.tracks).toHaveLength(101);
    expect(nowPlaying.queueOffset()).toBe(150);
  });

  it("moves the cursor without re-sending tracks inside the window", () => {
    setQueue(500, 200);
    nowPlaying.pushQueue();
    setQueue(500, 205);
    nowPlaying.pushQueue();

    expect(mockSetQueue).toHaveBeenCalledTimes(1);
    expect(mockSetQueueIndex).toHaveBeenCalledWith(55);
  });

  it("re-centres once the cursor nears the window's edge", () => {
    setQueue(500, 200);
    nowPlaying.pushQueue();
    setQueue(500, 245);
    nowPlaying.pushQueue();

    expect(mockSetQueue).toHaveBeenCalledTimes(2);
    expect(mockSetQueue.mock.calls[1][0].offset).toBe(195);
  });

  it("keeps the window when the queue starts or ends inside it", () => {
    setQueue(20, 0);
    nowPlaying.pushQueue();
    setQueue(20, 18);
    nowPlaying.pushQueue();

    expect(mockSetQueue).toHaveBeenCalledTimes(1);
    expect(mockSetQueueIndex).toHaveBeenCalledWith(18);
  });
});

describe("playback state", () => {
  it("doesn't re-send while the position follows its extrapolation", () => {
    jest.useFakeTimers();
    setQueue(1, 0);
    nowPlaying.pushPlaybackState(true);
    jest.advanceTimersByTime(1000);
    mockSnapshot = { ...mockSnapshot, currentTime: 1 };
    nowPlaying.pushPlaybackState();

    expect(mockSetPlaybackState).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("re-sends after a seek", () => {
    jest.useFakeTimers();
    setQueue(1, 0);
    nowPlaying.pushPlaybackState(true);
    jest.advanceTimersByTime(1000);
    mockSnapshot = { ...mockSnapshot, currentTime: 90 };
    nowPlaying.pushPlaybackState();

    expect(mockSetPlaybackState).toHaveBeenCalledTimes(2);
    expect(mockSetPlaybackState.mock.calls[1][0].positionMs).toBe(90000);
    jest.useRealTimers();
  });
});

describe("mirror subscriptions", () => {
  it("re-evaluates the error when the queue gains or loses its track", () => {
    mockOnline = false;
    setQueue(0, 0);
    nowPlaying.startPlaybackMirror();
    expect(mockSetError).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: "network" }),
    );
    const empty = mockQueueState;

    setQueue(3, 0);
    mockQueueListener?.(mockQueueState, empty);

    expect(mockSetError).toHaveBeenLastCalledWith(null);
  });

  it("follows playback progress only while a car is connected", () => {
    setQueue(3, 0);
    nowPlaying.startPlaybackMirror();
    expect(mockSubscribeProgress).not.toHaveBeenCalled();

    mockCarListener?.(true);
    mockCarListener?.(true);
    expect(mockSubscribeProgress).toHaveBeenCalledTimes(1);

    mockCarListener?.(false);
    expect(mockStopProgress).toHaveBeenCalledTimes(1);
  });
});

describe("player buttons", () => {
  it("leaves shuffle, repeat, favorite and radio out for a live stream", () => {
    const station = { id: "st1", isRadio: true };
    mockQueueState = {
      queue: [station],
      currentIndex: 0,
      shuffle: false,
      repeatMode: "off",
      getCurrent: () => station,
    };

    nowPlaying.pushButtons(true);

    expect(mockSetPlayerButtons).toHaveBeenCalledWith(
      expect.objectContaining({
        favorite: null,
        shuffle: false,
        repeat: false,
        radio: false,
      }),
    );
  });
});
