import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { LrclibRecord } from "@/services/lrclib/types";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// The lyrics text travels with the pick rather than just its LRCLIB id, so a
// chosen sheet renders instantly, offline, and without a lookup on every cold
// start. That costs a few KB per entry, hence the cap.
const MAX_PICKS = 300;

export interface LrclibPick {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  pickedAt: number;
}

interface LrclibPicksStore {
  picks: Record<string, LrclibPick>;
  setPick: (trackId: string, record: LrclibRecord) => void;
  clearPick: (trackId: string) => void;
  __reset: () => void;
}

function evictOldest(picks: Record<string, LrclibPick>) {
  const keys = Object.keys(picks);
  if (keys.length <= MAX_PICKS) return picks;
  const kept = keys
    .sort((a, b) => picks[b].pickedAt - picks[a].pickedAt)
    .slice(0, MAX_PICKS);
  return Object.fromEntries(kept.map((key) => [key, picks[key]]));
}

const useLrclibPicksBase = create<LrclibPicksStore>()(
  persist(
    (set) => ({
      picks: {},
      setPick: (trackId: string, record: LrclibRecord) => {
        set((state) => ({
          picks: evictOldest({
            ...state.picks,
            [trackId]: {
              id: record.id,
              trackName: record.trackName,
              artistName: record.artistName,
              albumName: record.albumName,
              duration: record.duration,
              syncedLyrics: record.syncedLyrics,
              plainLyrics: record.plainLyrics,
              pickedAt: Date.now(),
            },
          }),
        }));
      },
      clearPick: (trackId: string) => {
        set((state) => {
          if (!state.picks[trackId]) return state;
          const picks = { ...state.picks };
          delete picks[trackId];
          return { picks };
        });
      },
      __reset: () => {
        set({ picks: {} });
      },
    }),
    {
      name: "lrclibPicksStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
    },
  ),
);

const useLrclibPicks = createSelectors(useLrclibPicksBase);

export default useLrclibPicks;
