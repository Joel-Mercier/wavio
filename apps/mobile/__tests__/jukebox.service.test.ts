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
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

const mockStatusJukebox = jest.fn();
const mockGetJukebox = jest.fn();
const mockSkipJukebox = jest.fn();
const mockClearJukebox = jest.fn();
const mockSetJukebox = jest.fn();
const mockSetGainJukebox = jest.fn();
const mockStartJukebox = jest.fn();
const mockStopJukebox = jest.fn();
const mockAddJukebox = jest.fn();
jest.mock("@/services/backend/jukebox", () => ({
  addJukebox: (ids: string[]) => mockAddJukebox(ids),
  clearJukebox: () => mockClearJukebox(),
  getJukebox: () => mockGetJukebox(),
  setGainJukebox: (gain: number) => mockSetGainJukebox(gain),
  setJukebox: (ids: string[]) => mockSetJukebox(ids),
  skipJukebox: (index: number, offset?: number) =>
    mockSkipJukebox(index, offset),
  startJukebox: () => mockStartJukebox(),
  statusJukebox: () => mockStatusJukebox(),
  stopJukebox: () => mockStopJukebox(),
}));

const mockRestoreServerQueue = jest.fn();
jest.mock("@/services/player", () => ({
  restoreServerQueue: (...args: unknown[]) => mockRestoreServerQueue(...args),
}));

jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => ({ id: child.id, url: "u" }),
}));

type MockQueue = {
  queue: { id: string }[];
  currentIndex: number | null;
  setCurrentIndex: jest.Mock;
  next: jest.Mock;
  previous: jest.Mock;
  clearQueue: jest.Mock;
};
const mockQueueState: MockQueue = {
  queue: [],
  currentIndex: 0,
  setCurrentIndex: jest.fn(),
  next: jest.fn(),
  previous: jest.fn(),
  clearQueue: jest.fn(),
};
const mockQueueUnsub = jest.fn();
// The real store notifies synchronously inside set(); keeping the listener lets
// the tests drive queue changes the same way.
let queueListener: ((state: MockQueue) => void) | null = null;
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => mockQueueState,
    subscribe: jest.fn((listener: (state: MockQueue) => void) => {
      queueListener = listener;
      return mockQueueUnsub;
    }),
  },
}));

// Apply a local queue change and notify, as the store would.
function emitQueue(queue: { id: string }[], currentIndex: number | null) {
  mockQueueState.queue = queue;
  mockQueueState.currentIndex = currentIndex;
  queueListener?.(mockQueueState);
}

import {
  activate,
  deactivate,
  jukeboxCommitGain,
  jukeboxReconcileFromServer,
  jukeboxRefreshStatus,
  jukeboxSetGain,
  jukeboxSkipNext,
  jukeboxSkipPrevious,
} from "@/services/jukebox";
import type { JukeboxStatus } from "@/services/openSubsonic/types";
import useJukebox from "@/stores/jukebox";

const status = (currentIndex: number): { jukeboxStatus: JukeboxStatus } => ({
  jukeboxStatus: { currentIndex, gain: 0.5, playing: true, position: 0 },
});

// Mirror the server: mpv reports the position it was last seeked to, so status
// reflects the offset of the most recent skip. Lets settleSeek observe the seek
// actually landing.
const trackSeekedPosition = (currentIndex: number) => {
  let position = 0;
  mockSkipJukebox.mockImplementation((_index: number, offset?: number) => {
    position = offset ?? 0;
    return Promise.resolve(undefined);
  });
  mockStatusJukebox.mockImplementation(() =>
    Promise.resolve({
      jukeboxStatus: { currentIndex, gain: 0.5, playing: true, position },
    }),
  );
};

beforeEach(() => {
  mockStatusJukebox.mockReset();
  mockGetJukebox.mockReset();
  mockSkipJukebox.mockReset().mockResolvedValue(undefined);
  mockClearJukebox.mockReset().mockResolvedValue(undefined);
  mockSetJukebox.mockReset().mockResolvedValue(undefined);
  mockSetGainJukebox.mockReset().mockResolvedValue(undefined);
  mockStartJukebox.mockReset().mockResolvedValue(undefined);
  mockStopJukebox.mockReset().mockResolvedValue(undefined);
  mockAddJukebox.mockReset().mockResolvedValue(undefined);
  mockRestoreServerQueue.mockReset();
  mockQueueState.queue = [];
  mockQueueState.currentIndex = 0;
  mockQueueState.setCurrentIndex = jest.fn();
  mockQueueState.next = jest.fn();
  mockQueueState.previous = jest.fn();
  mockQueueState.clearQueue = jest.fn();
  queueListener = null;
  mockStatusJukebox.mockResolvedValue(status(0));
  useJukebox.setState(
    { active: false, status: null, gain: 0.5, pendingResume: false },
    false,
  );
});

describe("jukebox service - refreshStatus reconciliation", () => {
  test("stores the latest server status", async () => {
    mockStatusJukebox.mockResolvedValue(status(3));
    await jukeboxRefreshStatus();
    expect(useJukebox.getState().status?.currentIndex).toBe(3);
  });

  test("reconciles the local queue index when the server advanced", async () => {
    useJukebox.setState({ active: true }, false);
    mockQueueState.currentIndex = 0;
    mockStatusJukebox.mockResolvedValue(status(2));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).toHaveBeenCalledWith(2);
  });

  test("does not touch the queue when indexes already match", async () => {
    useJukebox.setState({ active: true }, false);
    mockQueueState.currentIndex = 2;
    mockStatusJukebox.mockResolvedValue(status(2));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });

  test("does not reconcile the queue index when jukebox is inactive", async () => {
    // Opening the device sheet refreshes status while still on the local device;
    // a stale server-side playlist must never yank the local queue's position.
    useJukebox.setState({ active: false }, false);
    mockQueueState.currentIndex = 1;
    mockStatusJukebox.mockResolvedValue(status(0));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
    expect(useJukebox.getState().status?.currentIndex).toBe(0);
  });

  test("swallows transient status errors without throwing", async () => {
    mockStatusJukebox.mockRejectedValue(new Error("network"));
    await expect(jukeboxRefreshStatus()).resolves.toBeUndefined();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });
});

describe("jukebox service - skip uses the post-advance index", () => {
  test("skipNext skips to the index after next() ran", async () => {
    mockQueueState.currentIndex = 0;
    mockQueueState.next = jest.fn(() => {
      mockQueueState.currentIndex = 1;
    });
    await jukeboxSkipNext();
    expect(mockQueueState.next).toHaveBeenCalled();
    expect(mockSkipJukebox).toHaveBeenCalledWith(1, 0);
  });

  test("skipPrevious skips to the index after previous() ran", async () => {
    mockQueueState.currentIndex = 2;
    mockQueueState.previous = jest.fn(() => {
      mockQueueState.currentIndex = 1;
    });
    await jukeboxSkipPrevious();
    expect(mockQueueState.previous).toHaveBeenCalled();
    expect(mockSkipJukebox).toHaveBeenCalledWith(1, 0);
  });
});

describe("jukebox service - reconcileFromServer", () => {
  const playlist = (
    ids: string[],
    currentIndex: number,
  ): { jukeboxPlaylist: JukeboxStatus & { entry: { id: string }[] } } => ({
    jukeboxPlaylist: {
      currentIndex,
      gain: 0.5,
      playing: true,
      position: 7,
      entry: ids.map((id) => ({ id })),
    },
  });

  test("rebuilds the local queue when the server playlist differs", async () => {
    mockQueueState.queue = [{ id: "a" }];
    mockGetJukebox.mockResolvedValue(playlist(["a", "b", "c"], 2));
    await jukeboxReconcileFromServer();
    expect(mockRestoreServerQueue).toHaveBeenCalledWith(
      [
        { id: "a", url: "u" },
        { id: "b", url: "u" },
        { id: "c", url: "u" },
      ],
      2,
      7,
    );
  });

  test("only reconciles the index when the playlist matches", async () => {
    mockQueueState.queue = [{ id: "a" }, { id: "b" }];
    mockQueueState.currentIndex = 0;
    mockGetJukebox.mockResolvedValue(playlist(["a", "b"], 1));
    await jukeboxReconcileFromServer();
    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
    expect(mockQueueState.setCurrentIndex).toHaveBeenCalledWith(1);
  });

  test("clears the local queue when the server playlist is empty", async () => {
    mockQueueState.queue = [{ id: "a" }];
    mockGetJukebox.mockResolvedValue(playlist([], 0));
    await jukeboxReconcileFromServer();
    expect(mockQueueState.clearQueue).toHaveBeenCalled();
    expect(mockRestoreServerQueue).not.toHaveBeenCalled();
  });

  test("swallows transient errors without throwing", async () => {
    mockGetJukebox.mockRejectedValue(new Error("network"));
    await expect(jukeboxReconcileFromServer()).resolves.toBeUndefined();
  });
});

describe("jukebox service - activate", () => {
  test("selects the current track then reseeks to the saved position once playing", async () => {
    jest.useFakeTimers();
    mockQueueState.queue = [{ id: "a" }, { id: "b" }];
    mockQueueState.currentIndex = 1;
    trackSeekedPosition(1);
    const p = activate({ position: 42.9, autoplay: true });
    await jest.advanceTimersByTimeAsync(2000);
    await p;
    expect(mockSkipJukebox).toHaveBeenNthCalledWith(1, 1, 0);
    expect(mockSkipJukebox).toHaveBeenNthCalledWith(2, 1, 42);
    expect(mockStopJukebox).not.toHaveBeenCalled();
    await deactivate();
    jest.useRealTimers();
  });

  test("starts the track without a reseek when there is no saved position", async () => {
    mockQueueState.queue = [{ id: "a" }];
    mockQueueState.currentIndex = 0;
    await activate({ position: 0, autoplay: true });
    expect(mockSkipJukebox).toHaveBeenCalledTimes(1);
    expect(mockSkipJukebox).toHaveBeenCalledWith(0, 0);
    expect(mockStopJukebox).not.toHaveBeenCalled();
    await deactivate();
  });

  test("restores the saved position then pauses when the local player was paused", async () => {
    jest.useFakeTimers();
    mockQueueState.queue = [{ id: "a" }];
    mockQueueState.currentIndex = 0;
    trackSeekedPosition(0);
    const p = activate({ position: 30, autoplay: false });
    await jest.advanceTimersByTimeAsync(2000);
    await p;
    expect(mockSkipJukebox).toHaveBeenNthCalledWith(1, 0, 0);
    expect(mockSkipJukebox).toHaveBeenNthCalledWith(2, 0, 30);
    expect(mockStopJukebox).toHaveBeenCalled();
    await deactivate();
    jest.useRealTimers();
  });

  test("mutes the 0:00 pre-roll then restores the gain when seeking", async () => {
    jest.useFakeTimers();
    mockQueueState.queue = [{ id: "a" }];
    mockQueueState.currentIndex = 0;
    trackSeekedPosition(0);
    const p = activate({ position: 30, autoplay: true });
    await jest.advanceTimersByTimeAsync(2000);
    await p;
    expect(mockSetGainJukebox).toHaveBeenNthCalledWith(1, 0);
    expect(mockSetGainJukebox).toHaveBeenLastCalledWith(0.5);
    await deactivate();
    jest.useRealTimers();
  });

  test("plays from 0:00 at full gain without muting when there is no saved position", async () => {
    mockQueueState.queue = [{ id: "a" }];
    mockQueueState.currentIndex = 0;
    await activate({ position: 0, autoplay: true });
    expect(mockSetGainJukebox).toHaveBeenCalledTimes(1);
    expect(mockSetGainJukebox).toHaveBeenCalledWith(0.5);
    await deactivate();
  });

  test("does not push tracks to the server when the queue is empty", async () => {
    mockQueueState.queue = [];
    await activate({ position: 0, autoplay: true });
    expect(mockSetJukebox).not.toHaveBeenCalled();
    expect(mockSkipJukebox).not.toHaveBeenCalled();
    expect(useJukebox.getState().active).toBe(true);
    await deactivate();
  });
});

describe("jukebox service - gain throttling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useJukebox.setState({ active: true }, false);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("sends the leading scrub immediately then rate-limits the rest", () => {
    jukeboxSetGain(0.1);
    jukeboxSetGain(0.2);
    jukeboxSetGain(0.3);
    // Only the leading value hits the network synchronously — the flood of
    // intermediate scrubs is coalesced.
    expect(mockSetGainJukebox).toHaveBeenCalledTimes(1);
    expect(mockSetGainJukebox).toHaveBeenLastCalledWith(0.1);
    // The trailing timer then flushes the latest value once the window elapses.
    jest.advanceTimersByTime(300);
    expect(mockSetGainJukebox).toHaveBeenCalledTimes(2);
    expect(mockSetGainJukebox).toHaveBeenLastCalledWith(0.3);
  });

  test("applies the gain locally on every scrub for a smooth thumb", () => {
    jukeboxSetGain(0.42);
    expect(useJukebox.getState().gain).toBe(0.42);
  });

  test("commit flushes the final gain immediately and cancels the trailing send", () => {
    jukeboxSetGain(0.5);
    mockSetGainJukebox.mockClear();
    jukeboxSetGain(0.6);
    jukeboxCommitGain(0.7);
    expect(mockSetGainJukebox).toHaveBeenCalledTimes(1);
    expect(mockSetGainJukebox).toHaveBeenLastCalledWith(0.7);
    expect(useJukebox.getState().gain).toBe(0.7);
    // No stale trailing flush afterwards.
    jest.advanceTimersByTime(300);
    expect(mockSetGainJukebox).toHaveBeenCalledTimes(1);
  });
});

describe("jukebox service - queue subscription", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Bring up a session over `ids`, then forget the calls activation itself made
  // so each test only sees what the queue change pushed.
  async function activateWith(ids: string[], index: number) {
    mockQueueState.queue = ids.map((id) => ({ id }));
    mockQueueState.currentIndex = index;
    await activate({ position: 0, autoplay: true });
    mockSetJukebox.mockClear();
    mockSkipJukebox.mockClear();
    mockSetGainJukebox.mockClear();
    mockStopJukebox.mockClear();
    mockClearJukebox.mockClear();
    mockAddJukebox.mockClear();
  }

  afterEach(async () => {
    await deactivate();
  });

  test("selecting another track in the same queue skips instead of re-uploading", async () => {
    // The reported bug: tapping track 3 of the album already playing moved only
    // the index, which the id comparison never saw — so nothing reached the
    // server and the status poll dragged the queue back to track 1.
    await activateWith(["a", "b", "c"], 0);
    emitQueue([{ id: "a" }, { id: "b" }, { id: "c" }], 2);
    await flush();
    expect(mockSetJukebox).not.toHaveBeenCalled();
    expect(mockSkipJukebox).toHaveBeenCalledWith(2, 0);
  });

  test("playing a different list uploads it then selects the tapped track", async () => {
    // `set` is a clear + add on the server, which leaves it stopped at index 0 —
    // the follow-up skip is what actually plays what the user tapped.
    await activateWith(["a", "b"], 0);
    emitQueue([{ id: "x" }, { id: "y" }, { id: "z" }], 2);
    await flush();
    expect(mockSetJukebox).toHaveBeenCalledWith(["x", "y", "z"]);
    expect(mockSkipJukebox).toHaveBeenCalledWith(2, 0);
  });

  test("appending adds only the tail and leaves the playing track alone", async () => {
    await activateWith(["a", "b"], 0);
    emitQueue([{ id: "a" }, { id: "b" }, { id: "c" }], 0);
    await flush();
    expect(mockAddJukebox).toHaveBeenCalledWith(["c"]);
    expect(mockSetJukebox).not.toHaveBeenCalled();
    expect(mockSkipJukebox).not.toHaveBeenCalled();
  });

  test("reordering re-uploads and resumes the same track at its position", async () => {
    jest.useFakeTimers();
    mockStatusJukebox.mockResolvedValue({
      jukeboxStatus: {
        currentIndex: 0,
        gain: 0.5,
        playing: true,
        position: 42,
      },
    });
    await activateWith(["a", "b", "c"], 0);
    emitQueue([{ id: "b" }, { id: "c" }, { id: "a" }], 2);
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockSetJukebox).toHaveBeenCalledWith(["b", "c", "a"]);
    expect(mockSkipJukebox).toHaveBeenCalledWith(2, 0);
    // The pre-roll is muted while the track is re-seeked to where it was.
    expect(mockSetGainJukebox).toHaveBeenNthCalledWith(1, 0);
    expect(mockSetGainJukebox).toHaveBeenLastCalledWith(0.5);
    jest.useRealTimers();
  });

  test("ignores a notification that moved neither the list nor the index", async () => {
    await activateWith(["a", "b"], 0);
    emitQueue([{ id: "a" }, { id: "b" }], 0);
    await flush();
    expect(mockSkipJukebox).not.toHaveBeenCalled();
    expect(mockSetJukebox).not.toHaveBeenCalled();
  });

  test("clearing the queue clears the server playlist", async () => {
    await activateWith(["a", "b"], 0);
    emitQueue([], null);
    await flush();
    expect(mockClearJukebox).toHaveBeenCalled();
  });

  test("adopting the server's index does not push it straight back", async () => {
    // setCurrentIndex notifies subscribers synchronously, so without the echo
    // guard every poll that advanced the queue would fire a skip at the server
    // it just came from.
    await activateWith(["a", "b", "c"], 0);
    mockQueueState.setCurrentIndex = jest.fn((index: number) => {
      emitQueue(mockQueueState.queue, index);
    });
    mockStatusJukebox.mockResolvedValue(status(1));
    await jukeboxRefreshStatus();
    await flush();
    expect(mockQueueState.setCurrentIndex).toHaveBeenCalledWith(1);
    expect(mockSkipJukebox).not.toHaveBeenCalled();
    expect(mockSetJukebox).not.toHaveBeenCalled();
  });

  test("tapping a track while the server is paused plays it", async () => {
    // The select inherited the server's paused state, so an explicit play ended
    // up stopping the jukebox on the track the user had just tapped.
    jest.useFakeTimers();
    await activateWith(["a", "b", "c"], 0);
    useJukebox.setState(
      { status: { currentIndex: 0, gain: 0.5, playing: false, position: 0 } },
      false,
    );
    mockStatusJukebox.mockResolvedValue({
      jukeboxStatus: { currentIndex: 2, gain: 0.5, playing: true, position: 0 },
    });

    emitQueue([{ id: "a" }, { id: "b" }, { id: "c" }], 2);
    await jest.advanceTimersByTimeAsync(5000);

    expect(mockSkipJukebox).toHaveBeenCalledWith(2, 0);
    expect(mockStopJukebox).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test("a selection superseded during its gain call never skips", async () => {
    // The gain round-trip is a window in which the user can pick another track
    // or hand playback back; resuming into the skip would drag the server onto
    // the track they just left.
    await activateWith(["a", "b", "c"], 0);
    const gate: { release: () => void } = { release: () => {} };
    mockSetGainJukebox.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          gate.release = () => resolve();
        }),
    );

    emitQueue([{ id: "a" }, { id: "b" }, { id: "c" }], 2);
    await flush();
    expect(mockSkipJukebox).not.toHaveBeenCalled();

    await deactivate();
    gate.release();
    await flush();

    expect(mockSkipJukebox).not.toHaveBeenCalled();
  });

  test("restores the gain the slider ended on, not the captured one", async () => {
    jest.useFakeTimers();
    await activateWith(["a", "b", "c"], 0);
    // The server sits at 0:00 while mpv loads, so the seek keeps retrying and
    // the restore is seconds away — long enough for the slider to move.
    mockStatusJukebox.mockResolvedValue({
      jukeboxStatus: { currentIndex: 2, gain: 0.5, playing: true, position: 0 },
    });
    useJukebox.setState(
      { status: { currentIndex: 0, gain: 0.5, playing: true, position: 42 } },
      false,
    );

    emitQueue([{ id: "b" }, { id: "c" }, { id: "a" }], 2);
    await jest.advanceTimersByTimeAsync(600);
    useJukebox.getState().setGain(0.9);
    await jest.advanceTimersByTimeAsync(5000);

    expect(mockSetGainJukebox).toHaveBeenNthCalledWith(1, 0);
    expect(mockSetGainJukebox).toHaveBeenLastCalledWith(0.9);
    jest.useRealTimers();
  });

  test("a poll that read the server before a skip cannot rewind the queue", async () => {
    await activateWith(["a", "b", "c"], 0);
    const readGate: { release: () => void } = { release: () => {} };
    mockGetJukebox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          readGate.release = () =>
            resolve({
              jukeboxPlaylist: {
                currentIndex: 0,
                gain: 0.5,
                playing: true,
                position: 0,
                entry: [{ id: "a" }, { id: "b" }, { id: "c" }],
              },
            });
        }),
    );
    const skipGate: { release: () => void } = { release: () => {} };
    mockSkipJukebox.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          skipGate.release = () => resolve();
        }),
    );

    const poll = jukeboxReconcileFromServer();
    mockQueueState.next = jest.fn(() => {
      mockQueueState.currentIndex = 1;
    });
    const skip = jukeboxSkipNext();
    await flush();
    // The read was issued before the skip, so it still describes index 0.
    readGate.release();
    await poll;
    const rewinds = mockQueueState.setCurrentIndex.mock.calls.length;
    skipGate.release();
    await skip;

    expect(rewinds).toBe(0);
  });

  test("skipNext issues one skip, not one per path", async () => {
    await activateWith(["a", "b"], 0);
    mockQueueState.next = jest.fn(() => {
      emitQueue(mockQueueState.queue, 1);
    });
    await jukeboxSkipNext();
    await flush();
    expect(mockSkipJukebox).toHaveBeenCalledTimes(1);
    expect(mockSkipJukebox).toHaveBeenCalledWith(1, 0);
  });
});
