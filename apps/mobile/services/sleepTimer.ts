import { create } from "zustand";

let pauseHandler: (() => void) | null = null;

export function registerSleepTimerPauseHandler(handler: () => void) {
  pauseHandler = handler;
}

type State = {
  endsAt: number | null;
  endOfTrack: boolean;
};

type Actions = {
  setMinutes: (minutes: number) => void;
  setEndOfTrack: () => void;
  cancel: () => void;
};

let timeoutId: ReturnType<typeof setTimeout> | null = null;

// Guarded, idempotent: nulls state before pausing so whichever path fires first
// (the setTimeout below or checkSleepTimerExpiry from the player status tick)
// wins and the other no-ops.
function fireSleepTimer() {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = null;
  useSleepTimer.setState({ endsAt: null, endOfTrack: false });
  pauseHandler?.();
}

export const useSleepTimer = create<State & Actions>((set) => ({
  endsAt: null,
  endOfTrack: false,
  setMinutes: (minutes) => {
    if (timeoutId) clearTimeout(timeoutId);
    const ms = minutes * 60 * 1000;
    timeoutId = setTimeout(fireSleepTimer, ms);
    set({ endsAt: Date.now() + ms, endOfTrack: false });
  },
  setEndOfTrack: () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
    set({ endsAt: null, endOfTrack: true });
  },
  cancel: () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
    set({ endsAt: null, endOfTrack: false });
  },
}));

// Background-safe entry point: the JS setTimeout is throttled/suspended while the
// app is backgrounded, so the player calls this from its native-driven playback
// status tick to fire the minutes timer on time regardless of app state.
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
    useSleepTimer.setState({ endOfTrack: false });
    return true;
  }
  return false;
}
