import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import {
  filterHidden,
  filterHiddenFromStart,
  type HiddenIndex,
  type HiddenMatchable,
  hiddenReason,
  isHiddenIndexEmpty,
} from "@/services/hiddenTracks/match";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// What the Settings list shows for an entry without a fetch, so it still works
// offline and for tracks the server no longer has.
export type HiddenTrackEntry = {
  hiddenAt: number;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
};

export type HiddenArtistEntry = {
  hiddenAt: number;
  name?: string;
  coverArt?: string;
};

// A track allowed to play despite its artist being blocked. It only covers the
// artist keys it was allowed against: lifting one of those blocks drops that
// key, so the exception never silently outlives a later re-block. A direct hide
// leaves it alone, so unhiding the track brings the exception back with it.
export type AllowedTrackEntry = {
  allowedAt: number;
  artistKeys: string[];
};

interface HiddenTracksStore extends HiddenIndex {
  tracks: Record<string, HiddenTrackEntry>;
  artists: Record<string, HiddenArtistEntry>;
  allowed: Record<string, AllowedTrackEntry>;
  hideTrack: (id: string, entry: Omit<HiddenTrackEntry, "hiddenAt">) => void;
  unhideTrack: (id: string) => void;
  hideArtist: (id: string, entry: Omit<HiddenArtistEntry, "hiddenAt">) => void;
  unhideArtist: (id: string) => void;
  allowTrack: (id: string, artistKeys: string[]) => void;
  clearAll: () => void;
  __reset: () => void;
}

const without = <T>(record: Record<string, T>, id: string) => {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
};

const initialState = {
  tracks: {} as Record<string, HiddenTrackEntry>,
  artists: {} as Record<string, HiddenArtistEntry>,
  allowed: {} as Record<string, AllowedTrackEntry>,
};

export const useHiddenTracksBase = create<HiddenTracksStore>()(
  persist(
    (set) => ({
      ...initialState,
      hideTrack: (id, entry) =>
        set((state) => ({
          tracks: { ...state.tracks, [id]: { ...entry, hiddenAt: Date.now() } },
        })),
      unhideTrack: (id) =>
        set((state) =>
          id in state.tracks ? { tracks: without(state.tracks, id) } : state,
        ),
      hideArtist: (id, entry) =>
        set((state) => ({
          artists: {
            ...state.artists,
            [id]: { ...entry, hiddenAt: Date.now() },
          },
        })),
      unhideArtist: (id) =>
        set((state) => {
          if (!(id in state.artists)) return state;
          const allowed: Record<string, AllowedTrackEntry> = {};
          for (const [trackId, entry] of Object.entries(state.allowed)) {
            const artistKeys = entry.artistKeys.filter((key) => key !== id);
            if (artistKeys.length === 0) continue;
            allowed[trackId] =
              artistKeys.length === entry.artistKeys.length
                ? entry
                : { ...entry, artistKeys };
          }
          return { artists: without(state.artists, id), allowed };
        }),
      allowTrack: (id, artistKeys) =>
        set((state) => ({
          allowed: {
            ...state.allowed,
            [id]: { allowedAt: Date.now(), artistKeys },
          },
        })),
      clearAll: () => set({ ...initialState }),
      __reset: () => set({ ...initialState }),
    }),
    {
      name: "hiddenTracksStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      partialize: (state) => ({
        tracks: state.tracks,
        artists: state.artists,
        allowed: state.allowed,
      }),
      skipHydration: true,
    },
  ),
);

const activeServerType = () => useAuthBase.getState().serverType;

export function hiddenReasonNow(track: HiddenMatchable) {
  const index = useHiddenTracksBase.getState();
  if (isHiddenIndexEmpty(index)) return null;
  return hiddenReason(index, track, activeServerType());
}

export function withoutHidden<T extends HiddenMatchable>(tracks: T[]): T[] {
  const index = useHiddenTracksBase.getState();
  if (isHiddenIndexEmpty(index)) return tracks;
  return filterHidden(tracks, index, activeServerType());
}

// For callers with their own "couldn't play" toast: playTracks has already
// raised ALL_TRACKS_HIDDEN for this list, so a second message would contradict it.
export function everyTrackHidden(tracks: HiddenMatchable[]): boolean {
  const index = useHiddenTracksBase.getState();
  if (tracks.length === 0 || isHiddenIndexEmpty(index)) return false;
  const serverType = activeServerType();
  return !tracks.some(
    (track) => hiddenReason(index, track, serverType) == null,
  );
}

export function withoutHiddenFromStart<T extends HiddenMatchable>(
  tracks: T[],
  startIndex: number,
): { tracks: T[]; startIndex: number } {
  const index = useHiddenTracksBase.getState();
  if (isHiddenIndexEmpty(index)) return { tracks, startIndex };
  return filterHiddenFromStart(tracks, startIndex, index, activeServerType());
}

const useHiddenTracks = createSelectors(useHiddenTracksBase);

export default useHiddenTracks;
