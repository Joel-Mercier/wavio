import { storage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type QueueTrack = {
  id: string;
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  // Allow extra metadata without the store needing to know its shape
  // biome-ignore lint/suspicious/noExplicitAny: allow arbitrary metadata for tracks
  [key: string]: any;
};

interface QueueStore {
  queue: QueueTrack[];
  currentIndex: number | null;
  removePlayed: boolean;
  setQueue: (tracks: QueueTrack[], startIndex?: number | null) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number | null) => void;
  setRemovePlayed: (remove: boolean) => void;

  enqueueNext: (track: QueueTrack | QueueTrack[]) => void;
  enqueueEnd: (track: QueueTrack | QueueTrack[]) => void;
  playNow: (tracks: QueueTrack[] | QueueTrack, startIndex?: number) => void;

  removeByIds: (ids: string[]) => void;
  removeAtIndices: (indices: number[]) => void;
  move: (from: number, to: number) => void;

  next: () => void;
  previous: () => void;

  getCurrent: () => QueueTrack | null;
}

const useQueueBase = create<QueueStore>()(
  persist(
    (set, get) => ({
      queue: [],
      currentIndex: null,
      removePlayed: true,

      setQueue: (tracks, startIndex = 0) => {
        set(() => {
          return {
            queue: [...tracks],
            currentIndex:
              tracks.length === 0
                ? null
                : startIndex != null
                  ? Math.max(0, Math.min(startIndex, tracks.length - 1))
                  : 0,
          };
        });
      },

      clearQueue: () => {
        set(() => {
          return {
            queue: [],
            currentIndex: null,
          };
        });
      },

      setCurrentIndex: (index) => {
        set((state) => {
          const nextIndex =
            index == null
              ? null
              : Math.max(0, Math.min(index, state.queue.length - 1));
          return { currentIndex: nextIndex };
        });
      },

      setRemovePlayed: (remove) => {
        set(() => ({ removePlayed: remove }));
      },

      enqueueNext: (track) => {
        set((state) => {
          const items = Array.isArray(track) ? track : [track];
          const insertAt =
            state.currentIndex != null
              ? state.currentIndex + 1
              : state.queue.length;
          const nextQueue = state.queue.slice();
          nextQueue.splice(insertAt, 0, ...items);
          return {
            queue: nextQueue,
            currentIndex:
              state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
          };
        });
      },

      enqueueEnd: (track) => {
        set((state) => {
          const items = Array.isArray(track) ? track : [track];
          const nextQueue = state.queue.concat(items);
          return {
            queue: nextQueue,
            currentIndex:
              state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
          };
        });
      },

      playNow: (tracks, startIndex = 0) => {
        const items = Array.isArray(tracks) ? tracks : [tracks];
        set(() => {
          return {
            queue: [...items],
            currentIndex:
              items.length === 0
                ? null
                : Math.max(0, Math.min(startIndex, items.length - 1)),
          };
        });
      },

      removeByIds: (ids) => {
        set((state) => {
          if (ids.length === 0) return state;
          const idSet = new Set(ids);
          const originalIndex = state.currentIndex;
          const filtered = state.queue.filter((t) => {
            const remove = idSet.has(t.id);
            return !remove;
          });
          let nextIndex: number | null = originalIndex;
          if (originalIndex != null) {
            const removedBefore = state.queue
              .slice(0, originalIndex)
              .filter((t) => idSet.has(t.id)).length;
            nextIndex = originalIndex - removedBefore;
            if (nextIndex >= filtered.length) nextIndex = filtered.length - 1;
            if (filtered.length === 0) nextIndex = null;
          }
          return {
            queue: filtered,
            currentIndex: nextIndex,
          };
        });
      },

      removeAtIndices: (indices) => {
        set((state) => {
          if (indices.length === 0) return state;
          const removeSet = new Set(
            indices.filter((i) => i >= 0 && i < state.queue.length),
          );
          if (removeSet.size === 0) return state;
          const filtered = state.queue.filter((_, idx) => !removeSet.has(idx));
          let nextIndex: number | null = state.currentIndex;
          if (state.currentIndex != null) {
            const currentIndex = state.currentIndex ?? 0;
            const removedBefore = [...removeSet].filter(
              (i) => i < currentIndex,
            ).length;
            nextIndex = currentIndex - removedBefore;
            if (nextIndex >= filtered.length) nextIndex = filtered.length - 1;
            if (filtered.length === 0) nextIndex = null;
          }
          return {
            queue: filtered,
            currentIndex: nextIndex,
          };
        });
      },

      move: (from, to) => {
        set((state) => {
          const length = state.queue.length;
          if (
            from === to ||
            from < 0 ||
            to < 0 ||
            from >= length ||
            to >= length
          )
            return state;
          const nextQueue = state.queue.slice();
          const [item] = nextQueue.splice(from, 1);
          nextQueue.splice(to, 0, item);

          let nextIndex: number | null = state.currentIndex;
          if (state.currentIndex != null) {
            nextIndex = state.currentIndex;
            if (from === state.currentIndex) nextIndex = to;
            else if (from < state.currentIndex && to >= state.currentIndex)
              nextIndex = state.currentIndex - 1;
            else if (from > state.currentIndex && to <= state.currentIndex)
              nextIndex = state.currentIndex + 1;
          }

          return {
            queue: nextQueue,
            currentIndex: nextIndex,
          };
        });
      },

      next: () => {
        set((state) => {
          if (state.queue.length === 0) return state;
          if (state.currentIndex == null) {
            return {
              currentIndex: state.queue.length > 0 ? 0 : null,
            };
          }

          let nextQueue = state.queue;
          let nextIndex: number | null = state.currentIndex;

          if (state.removePlayed) {
            nextQueue = state.queue.slice();
            nextQueue.splice(state.currentIndex, 1);
            if (nextQueue.length === 0) nextIndex = null;
            else if (state.currentIndex >= nextQueue.length)
              nextIndex = nextQueue.length - 1;
          } else {
            const candidate = state.currentIndex + 1;
            nextIndex = candidate < state.queue.length ? candidate : null;
          }

          return {
            queue: nextQueue,
            currentIndex: nextIndex,
          };
        });
      },

      previous: () => {
        set((state) => {
          if (state.queue.length === 0) return state;
          if (state.currentIndex == null) {
            return {
              currentIndex: state.queue.length > 0 ? 0 : null,
            };
          }

          const prevIndex = state.currentIndex - 1;
          const nextIndex = prevIndex >= 0 ? prevIndex : null;
          return { currentIndex: nextIndex };
        });
      },

      getCurrent: () => {
        const { queue, currentIndex } = get();
        if (
          currentIndex == null ||
          currentIndex < 0 ||
          currentIndex >= queue.length
        )
          return null;
        return queue[currentIndex];
      },
    }),
    {
      name: "queueStore",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name: string) => storage.getString(name) ?? null,
        setItem: (name: string, value: string) => storage.set(name, value),
        removeItem: (name: string) => storage.delete(name),
      })),
      partialize: (state) => ({
        queue: state.queue,
        currentIndex: state.currentIndex,
        removePlayed: state.removePlayed,
      }),
    },
  ),
);

const useQueue = createSelectors(useQueueBase);

export default useQueue;
