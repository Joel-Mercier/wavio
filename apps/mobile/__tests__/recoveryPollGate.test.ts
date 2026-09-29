// The recovery poll pings an unreachable server every 12 s on a background
// timer. It should only run while someone can benefit from a recovery: the app
// in the foreground, audio playing, or a car connected.

const mockSetEnabled = jest.fn();
const mockAppState: {
  currentState: string | null;
  listener: (() => void) | null;
} = { currentState: "active", listener: null };
let mockPlaying = false;
let mockPlaybackListener: (() => void) | null = null;
let mockCar = false;
let mockCarListener: ((connected: boolean) => void) | null = null;

jest.mock("react-native", () => ({
  Platform: {
    OS: "android",
    select: (options: Record<string, unknown>) =>
      options.android ?? options.native ?? options.default,
  },
  AppState: {
    get currentState() {
      return mockAppState.currentState;
    },
    addEventListener: (_: string, cb: () => void) => {
      mockAppState.listener = cb;
      return { remove: () => {} };
    },
  },
}));
jest.mock("@/hooks/player/playbackSnapshot", () => ({
  getPlaybackSnapshot: () => ({ playing: mockPlaying }),
  subscribePlaybackState: (cb: () => void) => {
    mockPlaybackListener = cb;
    return () => {};
  },
}));
jest.mock("@/services/carAuto/connection", () => ({
  isCarConnected: () => mockCar,
  subscribeCarConnection: (cb: (connected: boolean) => void) => {
    mockCarListener = cb;
    return () => {};
  },
}));
jest.mock("@/services/backgroundTimer", () => ({
  setBackgroundTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
  clearBackgroundTimer: (timer: ReturnType<typeof setTimeout>) =>
    clearTimeout(timer),
}));
jest.mock("@/services/network", () => ({
  setRecoveryPollEnabled: (enabled: boolean) => mockSetEnabled(enabled),
}));

import { startRecoveryPollGate } from "@/services/recoveryPollGate";

// Mirror of IDLE_GRACE_MS in services/recoveryPollGate.ts.
const IDLE_GRACE_MS = 15000;

const setAppState = (state: string) => {
  mockAppState.currentState = state;
  mockAppState.listener?.();
};
const setPlaying = (playing: boolean) => {
  mockPlaying = playing;
  mockPlaybackListener?.();
};
const setCar = (connected: boolean) => {
  mockCar = connected;
  mockCarListener?.(connected);
};

let stopGate: (() => void) | null = null;
const start = () => {
  stopGate = startRecoveryPollGate();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockSetEnabled.mockReset();
  mockAppState.currentState = "active";
  mockPlaying = false;
  mockCar = false;
});

afterEach(() => {
  stopGate?.();
  stopGate = null;
  jest.useRealTimers();
});

const lastCall = () => mockSetEnabled.mock.calls.at(-1)?.[0];

describe("recovery poll gate", () => {
  it("is enabled in the foreground and disabled once backgrounded and idle", () => {
    start();
    expect(lastCall()).toBe(true);
    setAppState("background");
    jest.advanceTimersByTime(IDLE_GRACE_MS - 1);
    expect(lastCall()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(lastCall()).toBe(false);
  });

  it("rides out the pause between two tracks", () => {
    start();
    setPlaying(true);
    setAppState("background");
    for (let i = 0; i < 5; i++) {
      setPlaying(false);
      jest.advanceTimersByTime(500);
      setPlaying(true);
    }
    jest.advanceTimersByTime(IDLE_GRACE_MS * 2);
    expect(mockSetEnabled.mock.calls).toEqual([[true]]);
  });

  it("stays enabled in the background while audio plays", () => {
    start();
    setPlaying(true);
    setAppState("background");
    expect(lastCall()).toBe(true);
    setPlaying(false);
    jest.advanceTimersByTime(IDLE_GRACE_MS);
    expect(lastCall()).toBe(false);
  });

  it("stays enabled in the background while a car is connected", () => {
    start();
    setAppState("background");
    jest.advanceTimersByTime(IDLE_GRACE_MS);
    expect(lastCall()).toBe(false);
    setCar(true);
    expect(lastCall()).toBe(true);
    setCar(false);
    jest.advanceTimersByTime(IDLE_GRACE_MS);
    expect(lastCall()).toBe(false);
  });

  it("treats an unknown or inactive state as present", () => {
    mockAppState.currentState = null;
    start();
    expect(lastCall()).toBe(true);
    setAppState("inactive");
    expect(lastCall()).toBe(true);
  });

  it("starts disabled on a headless boot with nothing playing", () => {
    mockAppState.currentState = "background";
    start();
    expect(mockSetEnabled.mock.calls).toEqual([[false]]);
  });

  it("only calls through when the outcome changes", () => {
    start();
    setPlaying(true);
    setCar(true);
    setAppState("inactive");
    expect(mockSetEnabled.mock.calls).toEqual([[true]]);
  });
});
