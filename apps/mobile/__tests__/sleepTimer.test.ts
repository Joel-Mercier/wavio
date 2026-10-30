const mockQueueState = {
  repeatMode: "off" as "off" | "all" | "one",
  removePlayed: false,
  currentIndex: 0 as number | null,
  queue: [{ id: "a" }, { id: "b" }],
  next: jest.fn(),
  getCurrent: () => mockQueueState.queue[mockQueueState.currentIndex ?? 0],
};

jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { getState: () => mockQueueState },
}));

jest.mock("@/stores/playbackNotice", () => ({
  __esModule: true,
  default: { getState: () => ({ show: jest.fn() }) },
}));

import { advanceAfterTrackEnd } from "@/services/playback/remoteAdvance";
import {
  checkSleepTimerExpiry,
  consumeSleepEndOfChapter,
  consumeSleepEndOfTrack,
  registerSleepTimerExpiryHandler,
  useSleepTimer,
} from "@/services/sleepTimer";
import {
  canFinishTrack,
  type PlaybackEndInput,
  projectChapterStop,
  projectPlaybackEnd,
} from "@/utils/playbackEnd";

const NOW = 1_000_000;
const MIN = 60_000;

const input = (overrides: Partial<PlaybackEndInput>): PlaybackEndInput => ({
  now: NOW,
  currentRemaining: 120,
  upcoming: [240, 300],
  cycle: false,
  cycleReordered: false,
  openEnded: false,
  until: null,
  finishTrack: false,
  ...overrides,
});

describe("projectPlaybackEnd", () => {
  it("ends the queue after the remaining tracks", () => {
    expect(projectPlaybackEnd(input({}))).toEqual({
      at: NOW + (120 + 240 + 300) * 1000,
      approximate: false,
    });
  });

  it("has no queue end when it loops or keeps extending", () => {
    expect(projectPlaybackEnd(input({ cycle: true }))).toBeNull();
    expect(projectPlaybackEnd(input({ openEnded: true }))).toBeNull();
  });

  it("marks a queue end with an unknown duration as approximate", () => {
    expect(projectPlaybackEnd(input({ upcoming: [240, null] }))).toEqual({
      at: NOW + 360 * 1000,
      approximate: true,
    });
  });

  it("stops at the deadline mid-song when not finishing the track", () => {
    expect(projectPlaybackEnd(input({ until: NOW + 5 * MIN }))).toEqual({
      at: NOW + 5 * MIN,
      approximate: false,
    });
  });

  it("stops at the end of the track playing at the deadline", () => {
    // 2 min left, then 4 min: the 5 min deadline lands in the second track.
    expect(
      projectPlaybackEnd(input({ until: NOW + 5 * MIN, finishTrack: true })),
    ).toEqual({ at: NOW + 6 * MIN, approximate: false });
  });

  it("stops at the queue end when it runs out before the deadline", () => {
    for (const finishTrack of [false, true]) {
      expect(
        projectPlaybackEnd(input({ until: NOW + 60 * MIN, finishTrack })),
      ).toEqual({ at: NOW + 11 * MIN, approximate: false });
    }
  });

  it("finishes the current track for end-of-track", () => {
    expect(
      projectPlaybackEnd(input({ until: NOW, finishTrack: true })),
    ).toEqual({ at: NOW + 2 * MIN, approximate: false });
  });

  it("walks a repeating queue until the deadline", () => {
    // 2 min left, then a 4 + 5 min loop: 2, 6, 11, 15, 20, 24…
    expect(
      projectPlaybackEnd(
        input({ until: NOW + 21 * MIN, finishTrack: true, cycle: true }),
      ),
    ).toEqual({ at: NOW + 24 * MIN, approximate: false });
  });

  it("is approximate past the first pass of a shuffled repeat", () => {
    expect(
      projectPlaybackEnd(
        input({
          until: NOW + 21 * MIN,
          finishTrack: true,
          cycle: true,
          cycleReordered: true,
        }),
      ),
    ).toEqual({ at: NOW + 24 * MIN, approximate: true });
  });

  it("can only estimate a finished track beyond an endless tail", () => {
    expect(
      projectPlaybackEnd(
        input({ until: NOW + 60 * MIN, finishTrack: true, openEnded: true }),
      ),
    ).toEqual({ at: NOW + 60 * MIN, approximate: true });
  });

  it("uses the deadline when the current track has no end", () => {
    expect(
      projectPlaybackEnd(
        input({
          currentRemaining: null,
          until: NOW + 5 * MIN,
          finishTrack: true,
        }),
      ),
    ).toEqual({ at: NOW + 5 * MIN, approximate: false });
    expect(projectPlaybackEnd(input({ currentRemaining: null }))).toBeNull();
  });

  it("has no queue end for a loop of tracks without durations", () => {
    expect(
      projectPlaybackEnd(input({ upcoming: [null], cycle: true })),
    ).toBeNull();
  });

  it("terminates on a loop of tracks without durations", () => {
    expect(
      projectPlaybackEnd(
        input({
          upcoming: [null],
          cycle: true,
          until: NOW + 60 * MIN,
          finishTrack: true,
        }),
      ),
    ).toEqual({ at: NOW + 60 * MIN, approximate: true });
  });
});

describe("projectChapterStop", () => {
  // Metamorphosis on the test server: three chapters, 9200 s.
  const ends = [2981.015828, 6176.016735, 9200.303311];
  const chapterEndAt = (bookTime: number) =>
    ends.find((end) => end > bookTime) ?? 9200.303311;
  const stop = (minutes: number, rate = 1) =>
    projectChapterStop({
      now: NOW,
      until: NOW + minutes * MIN,
      bookTime: 75,
      rate,
      chapterEndAt,
    });

  it("lets the chapter playing at the deadline finish", () => {
    expect(stop(5)).toEqual({
      at: NOW + (2981.015828 - 75) * 1000,
      approximate: false,
    });
    expect(stop(60)).toEqual({
      at: NOW + (6176.016735 - 75) * 1000,
      approximate: false,
    });
  });

  it("reads the book at its playback speed", () => {
    expect(stop(30, 2)?.at).toBe(NOW + ((6176.016735 - 75) / 2) * 1000);
  });

  it("gives up once the deadline falls past the book", () => {
    expect(stop(200)).toBeNull();
  });
});

describe("canFinishTrack", () => {
  const track = { duration: 200 };

  it("lets a playing track with a known length finish", () => {
    expect(canFinishTrack(track, true, false)).toBe(true);
  });

  it("refuses when paused, on the jukebox, or without a known end", () => {
    expect(canFinishTrack(track, false, false)).toBe(false);
    expect(canFinishTrack(track, true, true)).toBe(false);
    expect(canFinishTrack({ duration: 0 }, true, false)).toBe(false);
    expect(canFinishTrack({ ...track, isRadio: true }, true, false)).toBe(
      false,
    );
    expect(canFinishTrack(null, true, false)).toBe(false);
  });
});

describe("sleep timer store", () => {
  const onExpiry = jest.fn();

  beforeAll(() => registerSleepTimerExpiryHandler(onExpiry));

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    onExpiry.mockReset();
    useSleepTimer.getState().cancel();
  });

  afterEach(() => jest.useRealTimers());

  it("fires once after the chosen duration and resets", () => {
    useSleepTimer.getState().setMinutes(90);
    expect(useSleepTimer.getState()).toMatchObject({
      endsAt: NOW + 90 * MIN,
      durationMs: 90 * MIN,
    });
    jest.advanceTimersByTime(90 * MIN);
    expect(onExpiry).toHaveBeenCalledTimes(1);
    expect(useSleepTimer.getState().endsAt).toBeNull();
    expect(checkSleepTimerExpiry()).toBe(false);
    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it("lets the status tick fire it before the timer does", () => {
    useSleepTimer.getState().setMinutes(1);
    jest.setSystemTime(NOW + MIN);
    expect(checkSleepTimerExpiry()).toBe(true);
    jest.advanceTimersByTime(MIN);
    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it("never fires once cancelled", () => {
    useSleepTimer.getState().setMinutes(5);
    useSleepTimer.getState().cancel();
    jest.advanceTimersByTime(5 * MIN);
    expect(onExpiry).not.toHaveBeenCalled();
  });

  it("arms end-of-track when finishing the current song", () => {
    useSleepTimer.getState().setMinutes(5);
    useSleepTimer.getState().finishCurrentTrack();
    jest.advanceTimersByTime(5 * MIN);
    expect(onExpiry).not.toHaveBeenCalled();
    expect(useSleepTimer.getState()).toMatchObject({
      endOfTrack: true,
      finishing: true,
    });
    expect(consumeSleepEndOfTrack()).toBe(true);
    expect(useSleepTimer.getState().finishing).toBe(false);
    expect(consumeSleepEndOfTrack()).toBe(false);
  });
});

describe("end of chapter", () => {
  const chapterEnds = [100, 200, 300];
  const chapterEndAt = (_itemId: string, bookTime: number) =>
    chapterEnds.find((end) => end > bookTime) ?? null;
  const reached = (bookTime: number) =>
    consumeSleepEndOfChapter("book", bookTime, chapterEndAt);

  beforeEach(() => useSleepTimer.getState().setEndOfChapter("book", 100));

  it("stops when playback reaches the armed chapter's end", () => {
    expect(reached(98)).toBe(false);
    expect(reached(99)).toBe(false);
    expect(reached(99.7)).toBe(true);
    expect(useSleepTimer.getState().chapterEnd).toBeNull();
  });

  it("follows a skip to the end of the chapter it lands in", () => {
    expect(reached(40)).toBe(false);
    expect(reached(100)).toBe(false);
    expect(useSleepTimer.getState().chapterEnd).toEqual({
      itemId: "book",
      bookTime: 200,
    });
    expect(reached(198)).toBe(false);
    expect(reached(199.8)).toBe(true);
  });

  it("doesn't stop when a skip lands a hair short of the next chapter", () => {
    const realEnds = [2981.015828, 6176.016735];
    const realEndAt = (_itemId: string, bookTime: number) =>
      realEnds.find((end) => end > bookTime + 0.25) ?? null;
    useSleepTimer.getState().setEndOfChapter("book", 2981.015828);
    expect(consumeSleepEndOfChapter("book", 75, realEndAt)).toBe(false);
    expect(consumeSleepEndOfChapter("book", 2981.015, realEndAt)).toBe(false);
    expect(useSleepTimer.getState().chapterEnd?.bookTime).toBe(6176.016735);
  });

  it("follows a seek made before the first check", () => {
    expect(reached(250)).toBe(false);
    expect(useSleepTimer.getState().chapterEnd?.bookTime).toBe(300);
  });

  it("ignores another book", () => {
    expect(consumeSleepEndOfChapter("other", 99.9, chapterEndAt)).toBe(false);
    expect(useSleepTimer.getState().chapterEnd?.bookTime).toBe(100);
  });
});

describe("remote end of track", () => {
  beforeEach(() => {
    useSleepTimer.getState().cancel();
    mockQueueState.next.mockReset();
    mockQueueState.repeatMode = "off";
  });

  it("stops the remote instead of advancing", () => {
    const handlers = { reload: jest.fn(), stop: jest.fn() };
    useSleepTimer.getState().setEndOfTrack();
    advanceAfterTrackEnd(handlers);
    expect(handlers.stop).toHaveBeenCalledTimes(1);
    expect(mockQueueState.next).not.toHaveBeenCalled();
    expect(useSleepTimer.getState().endOfTrack).toBe(false);
  });

  it("stops even on repeat-one", () => {
    const handlers = { reload: jest.fn(), stop: jest.fn() };
    mockQueueState.repeatMode = "one";
    useSleepTimer.getState().setEndOfTrack();
    advanceAfterTrackEnd(handlers);
    expect(handlers.stop).toHaveBeenCalledTimes(1);
    expect(handlers.reload).not.toHaveBeenCalled();
  });

  it("advances as usual without a sleep timer", () => {
    const handlers = { reload: jest.fn(), stop: jest.fn() };
    advanceAfterTrackEnd(handlers);
    expect(handlers.stop).not.toHaveBeenCalled();
    expect(mockQueueState.next).toHaveBeenCalledTimes(1);
  });
});
