import { create } from "zustand";
import {
  type BackgroundTimer,
  clearBackgroundTimer,
  setBackgroundTimeout,
} from "@/services/backgroundTimer";

let expiryHandler: (() => void) | null = null;

export function registerSleepTimerExpiryHandler(handler: () => void) {
  expiryHandler = handler;
}

type State = {
  endsAt: number | null;
  durationMs: number | null;
  endOfTrack: boolean;
  // endOfTrack was armed by an expired timer with "finish current song" on,
  // rather than picked by the user.
  finishing: boolean;
  // Stop when this audiobook reaches this point of its timeline (the end of
  // the chapter playing when it was armed).
  chapterEnd: { itemId: string; bookTime: number } | null;
};

type Actions = {
  setMinutes: (minutes: number) => void;
  setEndOfTrack: () => void;
  finishCurrentTrack: () => void;
  setEndOfChapter: (itemId: string, bookTime: number) => void;
  cancel: () => void;
};

const IDLE: State = {
  endsAt: null,
  durationMs: null,
  endOfTrack: false,
  finishing: false,
  chapterEnd: null,
};

let timer: BackgroundTimer | null = null;
// Book time of the previous end-of-chapter check, to tell playback from a seek.
let lastChapterTick: number | null = null;

function clearTimer() {
  clearBackgroundTimer(timer);
  timer = null;
}

// Guarded, idempotent: resets state before handing over so whichever path fires
// first (the background timer below or checkSleepTimerExpiry from the player
// status tick) wins and the other no-ops.
function fireSleepTimer() {
  clearTimer();
  useSleepTimer.setState(IDLE);
  expiryHandler?.();
}

export const useSleepTimer = create<State & Actions>((set) => ({
  ...IDLE,
  setMinutes: (minutes) => {
    clearTimer();
    const ms = minutes * 60 * 1000;
    timer = setBackgroundTimeout(fireSleepTimer, ms);
    set({ ...IDLE, endsAt: Date.now() + ms, durationMs: ms });
  },
  setEndOfTrack: () => {
    clearTimer();
    set({ ...IDLE, endOfTrack: true });
  },
  finishCurrentTrack: () => {
    clearTimer();
    set({ ...IDLE, endOfTrack: true, finishing: true });
  },
  setEndOfChapter: (itemId, bookTime) => {
    clearTimer();
    lastChapterTick = null;
    set({ ...IDLE, chapterEnd: { itemId, bookTime } });
  },
  cancel: () => {
    clearTimer();
    set(IDLE);
  },
}));

export const isSleepTimerActive = (state: State) =>
  state.endsAt != null || state.endOfTrack || state.chapterEnd != null;

export function checkSleepTimerExpiry(): boolean {
  const { endsAt } = useSleepTimer.getState();
  if (endsAt != null && Date.now() >= endsAt) {
    fireSleepTimer();
    return true;
  }
  return false;
}

export function consumeSleepEndOfTrack(): boolean {
  if (useSleepTimer.getState().endOfTrack) {
    useSleepTimer.setState(IDLE);
    return true;
  }
  return false;
}

// Slack before the boundary at which a status tick counts as having reached it:
// ticks come every 250 ms, and stopping a hair early beats bleeding into the
// next chapter.
const CHAPTER_END_SLACK_SECONDS = 0.5;
// A larger step between two checks is a seek or a skip, not playback (3x speed
// with a late tick stays well under it).
const MAX_PLAYED_STEP_SECONDS = 5;

/**
 * True (and disarmed) once `bookTime` of `itemId` plays up to the armed chapter
 * end. A seek or skip moves the stop to the end of the chapter it lands in, the
 * way end-of-track follows a skip to the next track.
 */
export function consumeSleepEndOfChapter(
  itemId: string,
  bookTime: number,
  chapterEndAt: (itemId: string, bookTime: number) => number | null,
): boolean {
  const { chapterEnd } = useSleepTimer.getState();
  if (chapterEnd?.itemId !== itemId) return false;
  const previous = lastChapterTick;
  lastChapterTick = bookTime;
  let end = chapterEnd.bookTime;
  const played =
    previous != null &&
    bookTime >= previous &&
    bookTime - previous <= MAX_PLAYED_STEP_SECONDS;
  if (!played) {
    end = chapterEndAt(itemId, bookTime) ?? end;
    if (end !== chapterEnd.bookTime) {
      useSleepTimer.setState({ chapterEnd: { itemId, bookTime: end } });
    }
  }
  if (bookTime >= end - CHAPTER_END_SLACK_SECONDS) {
    useSleepTimer.setState(IDLE);
    return true;
  }
  return false;
}
