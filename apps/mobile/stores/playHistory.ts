import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";
import createSelectors from "@/utils/createSelectors";

// A snapshot rather than an id: the Recently played list must render with no
// server round-trip, so it keeps the same fields TrackListItem reads.
export type PlayHistoryEntry = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  artistId?: string;
  albumId?: string;
  coverArt?: string;
  duration?: number;
  contentType?: string;
  playedAt: number;
  // Last time the server confirmed this id still exists. Absent until the first
  // reconcile pass reaches it. See services/playHistory/reconcile.ts.
  verifiedAt?: number;
};

const MAX_ENTRIES = 100;

interface PlayHistoryStore {
  history: PlayHistoryEntry[];
  recordPlay: (track: QueueTrack) => void;
  removeIds: (ids: string[]) => void;
  markVerified: (ids: string[], at: number) => void;
  clearHistory: () => void;
  __reset: () => void;
}

const usePlayHistoryBase = create<PlayHistoryStore>()(
  persist(
    (set) => ({
      history: [],
      recordPlay: (track) => {
        set((state) => {
          const previous = state.history.find((item) => item.id === track.id);
          const withoutDuplicate = state.history.filter(
            (item) => item.id !== track.id,
          );
          const next: PlayHistoryEntry[] = [
            {
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              artistId: track.artistId,
              albumId: track.albumId,
              coverArt: track.coverArt,
              duration: track.duration,
              contentType: track.contentType,
              playedAt: Date.now(),
              // A replay is proof the id still resolves, but the stream may have
              // come from disk while offline — so carry the old value rather
              // than claiming a fresh server confirmation.
              verifiedAt: previous?.verifiedAt,
            },
            ...withoutDuplicate,
          ];
          if (next.length > MAX_ENTRIES) {
            next.length = MAX_ENTRIES;
          }
          return { history: next };
        });
      },
      removeIds: (ids) => {
        if (ids.length === 0) return;
        const removed = new Set(ids);
        set((state) => ({
          history: state.history.filter((item) => !removed.has(item.id)),
        }));
      },
      markVerified: (ids, at) => {
        if (ids.length === 0) return;
        const verified = new Set(ids);
        set((state) => ({
          history: state.history.map((item) =>
            verified.has(item.id) ? { ...item, verifiedAt: at } : item,
          ),
        }));
      },
      clearHistory: () => {
        set({ history: [] });
      },
      __reset: () => {
        set({ history: [] });
      },
    }),
    {
      name: "playHistory",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
    },
  ),
);

const usePlayHistory = createSelectors(usePlayHistoryBase);

export default usePlayHistory;
