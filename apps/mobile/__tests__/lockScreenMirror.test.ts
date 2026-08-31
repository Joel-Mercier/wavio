const mockSetRemotePlayback = jest.fn();
const mockUpdateRemotePlayback = jest.fn();
const mockPushLockScreenMetadata = jest.fn();
jest.mock("@/services/player", () => ({
  getActivePlayer: () => ({
    setRemotePlayback: (active: boolean) => mockSetRemotePlayback(active),
    updateRemotePlayback: (
      playing: boolean,
      positionMs: number,
      durationMs: number,
    ) => mockUpdateRemotePlayback(playing, positionMs, durationMs),
  }),
  pushLockScreenMetadata: (track: unknown) => mockPushLockScreenMetadata(track),
}));

// What the cached snapshot holds. Deliberately distinct from the target's own
// state below: while the app is backgrounded nothing refreshes this cache, so
// the mirror must never read it for a remote's position.
let mockSnapshot = {
  playing: false,
  buffering: false,
  currentTime: 0,
  duration: 0,
};
let mockRemoteSnapshot = {
  playing: false,
  buffering: false,
  currentTime: 0,
  duration: 0,
};
let mockStateListener: (() => void) | null = null;
jest.mock("@/hooks/player/playbackSnapshot", () => ({
  getPlaybackSnapshot: () => mockSnapshot,
  subscribePlaybackState: (cb: () => void) => {
    mockStateListener = cb;
    return () => {
      mockStateListener = null;
    };
  },
}));

let mockRemoteActive = false;
let mockRemoteListener: (() => void) | null = null;
jest.mock("@/services/playback/targets", () => ({
  activeRemoteTarget: () =>
    mockRemoteActive
      ? { id: "jukebox", readSnapshot: () => mockRemoteSnapshot }
      : null,
  subscribeRemoteChange: (cb: () => void) => {
    mockRemoteListener = cb;
    return () => {
      mockRemoteListener = null;
    };
  },
}));

type MockQueue = { queue: { id: string }[]; currentIndex: number | null };
const mockQueueState: MockQueue = { queue: [], currentIndex: 0 };
let mockQueueListener: (() => void) | null = null;
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      ...mockQueueState,
      getCurrent: () =>
        mockQueueState.currentIndex != null
          ? (mockQueueState.queue[mockQueueState.currentIndex] ?? null)
          : null,
    }),
    subscribe: (listener: () => void) => {
      mockQueueListener = listener;
      return () => {
        mockQueueListener = null;
      };
    },
  },
}));

import { startLockScreenMirror } from "@/services/playback/lockScreenMirror";

// Flip the active output and notify, as a RemoteTarget's own store would.
function setRemote(active: boolean) {
  mockRemoteActive = active;
  mockRemoteListener?.();
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSetRemotePlayback.mockReset();
  mockUpdateRemotePlayback.mockReset();
  mockPushLockScreenMetadata.mockReset();
  mockSnapshot = {
    playing: false,
    buffering: false,
    currentTime: 0,
    duration: 0,
  };
  mockRemoteSnapshot = {
    playing: false,
    buffering: false,
    currentTime: 0,
    duration: 0,
  };
  mockRemoteActive = false;
  mockRemoteListener = null;
  mockStateListener = null;
  mockQueueListener = null;
  mockQueueState.queue = [{ id: "a" }, { id: "b" }];
  mockQueueState.currentIndex = 0;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("lock screen mirror - handover", () => {
  test("claims the controls when a remote target takes over", () => {
    startLockScreenMirror();
    mockPushLockScreenMetadata.mockClear();
    mockSetRemotePlayback.mockClear();

    setRemote(true);

    // Metadata before the swap, so a session that isn't up yet gets raised.
    expect(mockPushLockScreenMetadata).toHaveBeenCalledWith({ id: "a" });
    expect(mockSetRemotePlayback).toHaveBeenCalledWith(true);
    expect(mockSetRemotePlayback).toHaveBeenCalledTimes(1);
  });

  test("hands the controls back when playback returns to this device", () => {
    startLockScreenMirror();
    setRemote(true);
    mockSetRemotePlayback.mockClear();
    mockPushLockScreenMetadata.mockClear();

    setRemote(false);

    expect(mockSetRemotePlayback).toHaveBeenCalledWith(false);
    // takeOverFromRemote reloads the track locally, which drives the controls
    // through the usual path — pushing metadata here would be redundant.
    expect(mockPushLockScreenMetadata).not.toHaveBeenCalled();
  });

  test("does not re-claim on a remote change that kept the same output", () => {
    startLockScreenMirror();
    setRemote(true);
    mockSetRemotePlayback.mockClear();

    mockRemoteListener?.();
    mockRemoteListener?.();

    expect(mockSetRemotePlayback).not.toHaveBeenCalled();
  });

  test("claims immediately at startup when a session is already active", () => {
    // Cold start into a restored jukebox session: nothing changes afterwards, so
    // waiting for a remote-change event would leave the controls local forever.
    mockRemoteActive = true;
    startLockScreenMirror();
    expect(mockSetRemotePlayback).toHaveBeenCalledWith(true);
  });
});

describe("lock screen mirror - state", () => {
  test("pushes the remote's transport state, in milliseconds", () => {
    startLockScreenMirror();
    setRemote(true);
    mockUpdateRemotePlayback.mockClear();
    mockRemoteSnapshot = {
      playing: true,
      buffering: false,
      currentTime: 12.4,
      duration: 210,
    };

    mockStateListener?.();

    expect(mockUpdateRemotePlayback).toHaveBeenCalledWith(true, 12400, 210000);
  });

  test("pulses the position so the seek bar advances between remote updates", () => {
    startLockScreenMirror();
    setRemote(true);
    mockRemoteSnapshot = {
      playing: true,
      buffering: false,
      currentTime: 5,
      duration: 100,
    };
    mockUpdateRemotePlayback.mockClear();

    jest.advanceTimersByTime(3000);

    expect(mockUpdateRemotePlayback).toHaveBeenCalledTimes(3);
  });

  test("pulses the target's live position, not the cached snapshot", () => {
    // The cache is only refreshed by a ticker that needs a mounted progress
    // subscriber, and with the screen locked there is none — reading it would
    // republish a stale position with a fresh timestamp on every pulse, and the
    // native side's wall-clock extrapolation would creep then snap back.
    startLockScreenMirror();
    setRemote(true);
    mockSnapshot = {
      playing: true,
      buffering: false,
      currentTime: 5,
      duration: 100,
    };
    mockRemoteSnapshot = { ...mockSnapshot };
    mockUpdateRemotePlayback.mockClear();

    jest.advanceTimersByTime(1000);
    mockRemoteSnapshot = { ...mockRemoteSnapshot, currentTime: 6 };
    jest.advanceTimersByTime(1000);

    expect(mockUpdateRemotePlayback).toHaveBeenNthCalledWith(
      1,
      true,
      5000,
      100000,
    );
    expect(mockUpdateRemotePlayback).toHaveBeenNthCalledWith(
      2,
      true,
      6000,
      100000,
    );
  });

  test("stops pulsing once playback is local again", () => {
    startLockScreenMirror();
    setRemote(true);
    setRemote(false);
    mockUpdateRemotePlayback.mockClear();

    jest.advanceTimersByTime(5000);

    expect(mockUpdateRemotePlayback).not.toHaveBeenCalled();
  });

  test("ignores playback state while this device owns playback", () => {
    startLockScreenMirror();
    mockStateListener?.();
    expect(mockUpdateRemotePlayback).not.toHaveBeenCalled();
  });
});

describe("lock screen mirror - track changes", () => {
  test("re-pushes metadata when the remote moves to another track", () => {
    startLockScreenMirror();
    setRemote(true);
    mockPushLockScreenMetadata.mockClear();

    mockQueueState.currentIndex = 1;
    mockQueueListener?.();

    expect(mockPushLockScreenMetadata).toHaveBeenCalledWith({ id: "b" });
  });

  test("ignores a queue change that left the current track alone", () => {
    startLockScreenMirror();
    setRemote(true);
    mockPushLockScreenMetadata.mockClear();

    mockQueueState.queue = [{ id: "a" }, { id: "b" }, { id: "c" }];
    mockQueueListener?.();

    expect(mockPushLockScreenMetadata).not.toHaveBeenCalled();
  });

  test("re-asserts remote mode after the queue empties and refills", () => {
    // Clearing the queue tears the controls down, and with them the native
    // remote flag — refilling has to claim them again or the notification comes
    // back showing the local engine.
    startLockScreenMirror();
    setRemote(true);
    mockSetRemotePlayback.mockClear();

    mockQueueState.queue = [];
    mockQueueState.currentIndex = null;
    mockQueueListener?.();
    expect(mockPushLockScreenMetadata).toHaveBeenLastCalledWith(null);
    expect(mockSetRemotePlayback).not.toHaveBeenCalled();

    mockQueueState.queue = [{ id: "z" }];
    mockQueueState.currentIndex = 0;
    mockQueueListener?.();
    expect(mockSetRemotePlayback).toHaveBeenCalledWith(true);
  });

  test("ignores track changes while this device owns playback", () => {
    startLockScreenMirror();
    mockPushLockScreenMetadata.mockClear();

    mockQueueState.currentIndex = 1;
    mockQueueListener?.();

    expect(mockPushLockScreenMetadata).not.toHaveBeenCalled();
  });
});
