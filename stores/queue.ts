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
  // Shuffle mode state
  shuffle: boolean;
  // Ordered list of ids representing the traversal order when shuffle is enabled
  shuffleOrderIds: string[] | null;
  // Cursor within shuffleOrderIds that points to the current track id
  shuffleCursor: number | null;
  setQueue: (tracks: QueueTrack[], startIndex?: number | null) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number | null) => void;
  setRemovePlayed: (remove: boolean) => void;
  setRepeatMode: (mode: "off" | "all" | "one") => void;
  setContext: (trackIds: string[] | null) => void;
  setShuffle: (enabled: boolean) => void;

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
      shuffle: false,
      shuffleOrderIds: null,
      shuffleCursor: null,

      // Build a new shuffle order constrained by current context (if any)
      // and ensure the current track id is placed at the cursor position.
      // This helper never escapes the store and does not mutate state directly.
      // It returns { orderIds, cursor }.
      _buildShuffleOrder: (
        state: Pick<QueueStore, "queue" | "currentIndex" | "contextIds">,
      ) => {
        const idsInQueue = state.queue.map((t) => t.id);
        const sourceIds =
          state.contextIds && state.contextIds.length > 0
            ? state.contextIds.filter((id: string) => idsInQueue.includes(id))
            : idsInQueue.slice();
        // Fisher–Yates shuffle
        const order = sourceIds.slice();
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        const currentId =
          state.currentIndex != null
            ? state.queue[state.currentIndex]?.id
            : undefined;
        let cursor: number | null = null;
        if (currentId) {
          let pos = order.indexOf(currentId);
          if (pos === -1 && sourceIds.length > 0) {
            // Ensure current id is present as first item if not in source
            order.unshift(currentId);
            pos = 0;
          }
          cursor = pos >= 0 ? pos : null;
        }
        return { orderIds: order, cursor };
      },

      setQueue: (tracks, startIndex = 0) => {
        set((state) => {
          // When replacing the queue, drop context if it no longer applies
          const newIds = new Set(tracks.map((t) => t.id));
          const nextContext = state.contextIds
            ? state.contextIds.filter((id) => newIds.has(id))
            : null;
          const base: Partial<QueueStore> = {
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
          if (state.shuffle) {
            const built = (
              get() as unknown as {
                _buildShuffleOrder: (s: unknown) => {
                  orderIds: string[];
                  cursor: number | null;
                };
              }
            )._buildShuffleOrder({
              ...state,
              ...base,
            });
            return {
              ...base,
              shuffleOrderIds: built.orderIds,
              shuffleCursor: built.cursor,
            } as Partial<QueueStore>;
          }
          return {
            ...base,
            shuffleOrderIds: null,
            shuffleCursor: null,
          } as Partial<QueueStore>;
        });
      },

      clearQueue: () => {
        set(() => {
          return {
            queue: [],
            currentIndex: null,
            contextIds: null,
            shuffleOrderIds: null,
            shuffleCursor: null,
          };
        });
      },

      setCurrentIndex: (index) => {
        set((state) => {
          const nextIndex =
            index == null
              ? null
              : Math.max(0, Math.min(index, state.queue.length - 1));
          // Update shuffle cursor to align with the selected id
          if (!state.shuffle || nextIndex == null)
            return { currentIndex: nextIndex };
          const targetId = state.queue[nextIndex]?.id;
          if (!targetId) return { currentIndex: nextIndex };
          let order = state.shuffleOrderIds ?? [];
          let cursor: number | null = order.indexOf(targetId);
          if (cursor === -1) {
            // Rebuild to include the target and align cursor
            const built = (
              get() as unknown as {
                _buildShuffleOrder: (s: unknown) => {
                  orderIds: string[];
                  cursor: number | null;
                };
              }
            )._buildShuffleOrder({
              ...state,
              currentIndex: nextIndex,
            });
            order = built.orderIds;
            cursor = built.cursor;
          }
          return {
            currentIndex: nextIndex,
            shuffleOrderIds: order,
            shuffleCursor: cursor,
          } as Partial<QueueStore>;
        });
      },

      setRemovePlayed: (remove) => {
        set(() => ({ removePlayed: remove }));
      },

      setRepeatMode: (mode) => {
        set((state) => {
          // Changing repeat mode can alter context application; rebuild shuffle if active
          if (!state.shuffle) return { repeatMode: mode };
          const built = (
            get() as unknown as {
              _buildShuffleOrder: (s: unknown) => {
                orderIds: string[];
                cursor: number | null;
              };
            }
          )._buildShuffleOrder(state);
          return {
            repeatMode: mode,
            shuffleOrderIds: built.orderIds,
            shuffleCursor: built.cursor,
          } as Partial<QueueStore>;
        });
      },

      setContext: (trackIds) => {
        set((state) => {
          if (!trackIds || trackIds.length === 0) return { contextIds: null };
          const availableIds = new Set(state.queue.map((t) => t.id));
          const filtered = trackIds.filter((id) => availableIds.has(id));
          const nextContext = filtered.length > 0 ? filtered : null;
          if (!state.shuffle) return { contextIds: nextContext };
          const built = (
            get() as unknown as {
              _buildShuffleOrder: (s: unknown) => {
                orderIds: string[];
                cursor: number | null;
              };
            }
          )._buildShuffleOrder({
            ...state,
            contextIds: nextContext,
          });
          return {
            contextIds: nextContext,
            shuffleOrderIds: built.orderIds,
            shuffleCursor: built.cursor,
          } as Partial<QueueStore>;
        });
      },

      setShuffle: (enabled) => {
        set((state) => {
          if (enabled === state.shuffle) return state;
          if (!enabled) {
            return {
              shuffle: false,
              shuffleOrderIds: null,
              shuffleCursor: null,
            };
          }
          const built = (
            get() as unknown as {
              _buildShuffleOrder: (s: unknown) => {
                orderIds: string[];
                cursor: number | null;
              };
            }
          )._buildShuffleOrder(state);
          return {
            shuffle: true,
            shuffleOrderIds: built.orderIds,
            shuffleCursor: built.cursor,
          } as Partial<QueueStore>;
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
          const base: Partial<QueueStore> = {
            queue: nextQueue,
            currentIndex:
              state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
          };
          if (state.shuffle) {
            // Append new ids randomly to the remaining order after the cursor
            const newIds = items.map((t) => t.id);
            const order = (state.shuffleOrderIds ?? []).slice();
            // Insert new ids at random positions after current cursor if exists; else at end
            const startPos =
              state.shuffleCursor != null
                ? state.shuffleCursor + 1
                : order.length;
            for (const id of newIds) {
              const pos =
                startPos +
                Math.floor(Math.random() * (order.length - startPos + 1));
              order.splice(pos, 0, id);
            }
            return { ...base, shuffleOrderIds: order } as Partial<QueueStore>;
          }
          return base;
        });
      },

      enqueueEnd: (track) => {
        set((state) => {
          const items = Array.isArray(track) ? track : [track];
          const nextQueue = state.queue.concat(items);
          // Keep contextIds as-is; they are based on ids and remain valid
          const base: Partial<QueueStore> = {
            queue: nextQueue,
            currentIndex:
              state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
          };
          if (state.shuffle) {
            const newIds = items.map((t) => t.id);
            const order = (state.shuffleOrderIds ?? []).slice();
            // Place all new ids at the end in random order
            const shuffled = newIds.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return {
              ...base,
              shuffleOrderIds: order.concat(shuffled),
            } as Partial<QueueStore>;
          }
          return base;
        });
      },

      playNow: (tracks, startIndex = 0) => {
        const items = Array.isArray(tracks) ? tracks : [tracks];
        set((state) => {
          const newIds = new Set(items.map((t) => t.id));
          const nextContext = state.contextIds
            ? state.contextIds.filter((id) => newIds.has(id))
            : null;
          const base: Partial<QueueStore> = {
            queue: [...items],
            currentIndex:
              items.length === 0
                ? null
                : Math.max(0, Math.min(startIndex, items.length - 1)),
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
          };
          if (state.shuffle) {
            const built = (
              get() as unknown as {
                _buildShuffleOrder: (s: unknown) => {
                  orderIds: string[];
                  cursor: number | null;
                };
              }
            )._buildShuffleOrder({
              ...state,
              ...base,
            });
            return {
              ...base,
              shuffleOrderIds: built.orderIds,
              shuffleCursor: built.cursor,
            } as Partial<QueueStore>;
          }
          return {
            ...base,
            shuffleOrderIds: null,
            shuffleCursor: null,
          } as Partial<QueueStore>;
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
          const base: Partial<QueueStore> = {
            queue: filtered,
            currentIndex: nextIndex,
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
          };
          if (state.shuffle) {
            const order = (state.shuffleOrderIds ?? []).filter(
              (id) => !idSet.has(id),
            );
            let cursor = state.shuffleCursor;
            if (cursor != null) {
              // Repoint cursor to current id
              const currentId =
                nextIndex != null ? filtered[nextIndex]?.id : undefined;
              cursor = currentId ? order.indexOf(currentId) : null;
            }
            return {
              ...base,
              shuffleOrderIds: order,
              shuffleCursor: cursor,
            } as Partial<QueueStore>;
          }
          return base;
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
          const base: Partial<QueueStore> = {
            queue: filtered,
            currentIndex: nextIndex,
            contextIds:
              nextContext && nextContext.length > 0 ? nextContext : null,
          };
          if (state.shuffle) {
            const order = (state.shuffleOrderIds ?? []).filter(
              (id) => !removedIds.has(id),
            );
            let cursor = state.shuffleCursor;
            if (cursor != null) {
              const currentId =
                nextIndex != null ? filtered[nextIndex]?.id : undefined;
              cursor = currentId ? order.indexOf(currentId) : null;
            }
            return {
              ...base,
              shuffleOrderIds: order,
              shuffleCursor: cursor,
            } as Partial<QueueStore>;
          }
          return base;
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

          // Shuffle path: drive by shuffle order ids
          if (
            state.shuffle &&
            state.shuffleOrderIds &&
            state.shuffleOrderIds.length > 0
          ) {
            let order = state.shuffleOrderIds.slice();
            const cursor =
              state.shuffleCursor ??
              (state.currentIndex != null
                ? order.indexOf(state.queue[state.currentIndex].id)
                : -1);
            // If removing played, drop current from order and queue before advancing
            if (state.removePlayed) {
              const currentId = state.queue[state.currentIndex]?.id;
              if (currentId) {
                order = order.filter((id) => id !== currentId);
              }
            }
            if (order.length === 0) {
              return {
                queue: state.removePlayed ? [] : state.queue,
                currentIndex: null,
                shuffleOrderIds: [],
                shuffleCursor: null,
              } as Partial<QueueStore>;
            }
            // Advance cursor
            if (!state.removePlayed) {
              const safeCursor = cursor == null ? -1 : cursor;
              const nextCursor = safeCursor + 1;
              if (nextCursor < order.length) {
                const targetId = order[nextCursor];
                const targetIndex = state.queue.findIndex(
                  (t) => t.id === targetId,
                );
                return {
                  currentIndex:
                    targetIndex >= 0 ? targetIndex : state.currentIndex,
                  shuffleOrderIds: order,
                  shuffleCursor: nextCursor,
                } as Partial<QueueStore>;
              }
              // End reached
              if (isRepeatAll) {
                const targetId = order[0];
                const targetIndex = state.queue.findIndex(
                  (t) => t.id === targetId,
                );
                return {
                  currentIndex:
                    targetIndex >= 0 ? targetIndex : state.currentIndex,
                  shuffleOrderIds: order,
                  shuffleCursor: 0,
                } as Partial<QueueStore>;
              }
              return { currentIndex: null } as Partial<QueueStore>;
            }
            {
              // removePlayed path: remove current from queue and move to next id in order (at same position)
              const nextQueue = state.queue.slice();
              nextQueue.splice(state.currentIndex, 1);
              const nextId = order[0];
              const nextIndex = nextQueue.findIndex((t) => t.id === nextId);
              return {
                queue: nextQueue,
                currentIndex:
                  nextQueue.length === 0
                    ? null
                    : nextIndex >= 0
                      ? nextIndex
                      : 0,
                shuffleOrderIds: order,
                shuffleCursor: 0,
              } as Partial<QueueStore>;
            }
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

          if (
            state.shuffle &&
            state.shuffleOrderIds &&
            state.shuffleOrderIds.length > 0
          ) {
            const order = state.shuffleOrderIds.slice();
            const cursor =
              state.shuffleCursor ??
              (state.currentIndex != null
                ? order.indexOf(state.queue[state.currentIndex].id)
                : -1);
            if (state.removePlayed) {
              // With removePlayed, previous behaves like going to previous in order if exists; queue hasn't removed past items
              // This is tricky; simplify: step back if possible, else wrap (repeat all) or null
            }
            const prevCursor = cursor == null ? -1 : cursor - 1;
            if (prevCursor >= 0) {
              const targetId = order[prevCursor];
              const targetIndex = state.queue.findIndex(
                (t) => t.id === targetId,
              );
              return {
                currentIndex:
                  targetIndex >= 0 ? targetIndex : state.currentIndex,
                shuffleCursor: prevCursor,
              } as Partial<QueueStore>;
            }
            if (isRepeatAll) {
              const lastId = order[order.length - 1];
              const targetIndex = state.queue.findIndex((t) => t.id === lastId);
              return {
                currentIndex:
                  targetIndex >= 0 ? targetIndex : state.currentIndex,
                shuffleCursor: order.length - 1,
              } as Partial<QueueStore>;
            }
            return { currentIndex: null } as Partial<QueueStore>;
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
      version: 2,
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
        shuffle: state.shuffle,
        shuffleOrderIds: state.shuffleOrderIds,
        shuffleCursor: state.shuffleCursor,
      }),
    },
  ),
);

const useQueue = createSelectors(useQueueBase);

export default useQueue;
