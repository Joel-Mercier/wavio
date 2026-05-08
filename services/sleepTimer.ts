import { create } from "zustand";
import { pause } from "@/services/player";

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

export const useSleepTimer = create<State & Actions>((set) => ({
  endsAt: null,
  endOfTrack: false,
  setMinutes: (minutes) => {
    if (timeoutId) clearTimeout(timeoutId);
    const ms = minutes * 60 * 1000;
    timeoutId = setTimeout(() => {
      pause();
      timeoutId = null;
      useSleepTimer.setState({ endsAt: null, endOfTrack: false });
    }, ms);
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

export function consumeSleepEndOfTrack(): boolean {
  if (useSleepTimer.getState().endOfTrack) {
    useSleepTimer.setState({ endOfTrack: false });
    return true;
  }
  return false;
}
