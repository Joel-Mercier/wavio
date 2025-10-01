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
  repeatMode: "off" | "all" | "one";
  // Optional context subset that defines the loop scope for repeatMode "all"
  // Represented by track ids to remain stable across reorders
  contextIds: string[] | null;
  setQueue: (tracks: QueueTrack[], startIndex?: number | null) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number | null) => void;
  setRemovePlayed: (remove: boolean) => void;
  setRepeatMode: (mode: "off" | "all" | "one") => void;
  setContext: (trackIds: string[] | null) => void;

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
      repeatMode: "off",
      contextIds: null,

      setQueue: (tracks, startIndex = 0) => {
        set((state) => {
          // When replacing the queue, drop context if it no longer applies
          const newIds = new Set(tracks.map((t) => t.id));
          const nextContext = state.contextIds
            ? state.contextIds.filter((id) => newIds.has(id))
            : null;
          return {
            queue: [...tracks],
            currentIndex:
              tracks.length === 0
                ? null
                : startIndex != null
                  ? Math.max(0, Math.min(startIndex, tracks.length - 1))
                  : 0,
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
          };
        });
      },

      clearQueue: () => {
        set(() => {
          return {
            queue: [],
            currentIndex: null,
            contextIds: null,
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

      setRepeatMode: (mode) => {
        set(() => ({ repeatMode: mode }));
      },

      setContext: (trackIds) => {
        set((state) => {
          if (!trackIds || trackIds.length === 0) return { contextIds: null };
          const availableIds = new Set(state.queue.map((t) => t.id));
          const filtered = trackIds.filter((id) => availableIds.has(id));
          return { contextIds: filtered.length > 0 ? filtered : null };
        });
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
          // Keep contextIds as-is; they are based on ids and remain valid
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
          // Keep contextIds as-is; they are based on ids and remain valid
          return {
            queue: nextQueue,
            currentIndex:
              state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
          };
        });
      },

      playNow: (tracks, startIndex = 0) => {
        const items = Array.isArray(tracks) ? tracks : [tracks];
        set((state) => {
          const newIds = new Set(items.map((t) => t.id));
          const nextContext = state.contextIds
            ? state.contextIds.filter((id) => newIds.has(id))
            : null;
          return {
            queue: [...items],
            currentIndex:
              items.length === 0
                ? null
                : Math.max(0, Math.min(startIndex, items.length - 1)),
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
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
          const nextContext = state.contextIds
            ? state.contextIds.filter((id) => !idSet.has(id))
            : null;
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
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
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
          const removedIds = new Set(
            state.queue.filter((_, idx) => removeSet.has(idx)).map((t) => t.id),
          );
          const nextContext = state.contextIds
            ? state.contextIds.filter((id) => !removedIds.has(id))
            : null;
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
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
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

          const isRepeatOne = state.repeatMode === "one";
          const isRepeatAll = state.repeatMode === "all";

          // Repeat one: stay on the same track, never remove current
          if (isRepeatOne) {
            return { currentIndex: state.currentIndex };
          }

          // If a context subset is defined and repeat-all is active, wrap within the subset
          if (isRepeatAll && state.contextIds && state.contextIds.length > 0) {
            const currentId = state.queue[state.currentIndex]?.id;
            const ids = state.contextIds;
            const count = ids.length;
            const pos = currentId ? ids.indexOf(currentId) : -1;

            // If current is not in context, snap to first valid id in context
            const startPos = pos >= 0 ? pos : 0;
            for (let offset = 1; offset <= count; offset++) {
              const nextPos = (startPos + offset) % count;
              const targetId = ids[nextPos];
              const targetIndex = state.queue.findIndex(
                (t) => t.id === targetId,
              );
              if (targetIndex >= 0) {
                return { currentIndex: targetIndex };
              }
            }
            // No valid target (context references removed tracks)
            return state;
          }

          // When removing played tracks, we pop current and advance to the next item at the same index
          if (state.removePlayed) {
            const nextQueue = state.queue.slice();
            nextQueue.splice(state.currentIndex, 1);
            if (nextQueue.length === 0) {
              return { queue: nextQueue, currentIndex: null };
            }
            const nextIndex = Math.min(
              state.currentIndex,
              nextQueue.length - 1,
            );
            return { queue: nextQueue, currentIndex: nextIndex };
          }

          // Not removing played tracks
          const length = state.queue.length;
          const candidate = state.currentIndex + 1;
          let nextIndex: number | null;
          if (candidate < length) {
            nextIndex = candidate;
          } else {
            nextIndex = isRepeatAll ? 0 : null;
          }

          return { currentIndex: nextIndex } as Partial<QueueStore>;
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

          const isRepeatOne = state.repeatMode === "one";
          const isRepeatAll = state.repeatMode === "all";

          if (isRepeatOne) {
            return { currentIndex: state.currentIndex };
          }

          // If a context subset is defined and repeat-all is active, wrap within the subset backwards
          if (isRepeatAll && state.contextIds && state.contextIds.length > 0) {
            const currentId = state.queue[state.currentIndex]?.id;
            const ids = state.contextIds;
            const count = ids.length;
            const pos = currentId ? ids.indexOf(currentId) : -1;
            const startPos = pos >= 0 ? pos : 0;
            for (let offset = 1; offset <= count; offset++) {
              const prevPos = (startPos - offset + count) % count;
              const targetId = ids[prevPos];
              const targetIndex = state.queue.findIndex(
                (t) => t.id === targetId,
              );
              if (targetIndex >= 0) {
                return { currentIndex: targetIndex };
              }
            }
            return state;
          }

          const prevIndex = state.currentIndex - 1;
          if (prevIndex >= 0) return { currentIndex: prevIndex };

          // Wrap to end only when repeating all
          if (isRepeatAll && state.queue.length > 0) {
            return { currentIndex: state.queue.length - 1 };
          }

          return { currentIndex: null };
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
        repeatMode: state.repeatMode,
        contextIds: state.contextIds,
      }),
    },
  ),
);

const useQueue = createSelectors(useQueueBase);

export default useQueue;
