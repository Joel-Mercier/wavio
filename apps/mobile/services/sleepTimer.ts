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
};

type Actions = {
  setMinutes: (minutes: number) => void;
  setEndOfTrack: () => void;
  finishCurrentTrack: () => void;
  cancel: () => void;
};

const IDLE: State = {
  endsAt: null,
  durationMs: null,
  endOfTrack: false,
  finishing: false,
};

let timer: BackgroundTimer | null = null;

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
  cancel: () => {
    clearTimer();
    set(IDLE);
  },
}));

export const isSleepTimerActive = (state: State) =>
  state.endsAt != null || state.endOfTrack;

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
