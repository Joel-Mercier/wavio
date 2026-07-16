import { create } from "zustand";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

export type QueueSource = {
  type:
    | "album"
    | "playlist"
    | "artist"
    | "likedSongs"
    | "folder"
    | "similar"
    | "mostPlayed"
    | "albumList"
    | "playlistList";
  name: string;
  // Present for navigable sources (album/playlist/artist/folder)
  id?: string;
} | null;

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
  // Where the current queue was played from (Spotify-style "Playing from …")
  source: QueueSource;
  setQueue: (
    tracks: QueueTrack[],
    startIndex?: number | null,
    source?: QueueSource,
  ) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number | null) => void;
  setRemovePlayed: (remove: boolean) => void;
  setRepeatMode: (mode: "off" | "all" | "one") => void;
  setContext: (trackIds: string[] | null) => void;
  setShuffle: (enabled: boolean) => void;

  enqueueNext: (track: QueueTrack | QueueTrack[]) => void;
  enqueueEnd: (track: QueueTrack | QueueTrack[]) => void;
  playNow: (
    tracks: QueueTrack[] | QueueTrack,
    startIndex?: number,
    source?: QueueSource,
  ) => void;

  updateTrack: (id: string, patch: Partial<QueueTrack>) => void;
  removeByIds: (ids: string[]) => void;
  removeAtIndices: (indices: number[]) => void;
  move: (from: number, to: number) => void;

  next: () => void;
  previous: () => void;

  getCurrent: () => QueueTrack | null;
  __reset: () => void;
}

const initialQueueState = {
  queue: [] as QueueTrack[],
  currentIndex: null as number | null,
  removePlayed: false,
  repeatMode: "off" as "off" | "all" | "one",
  contextIds: null as string[] | null,
  shuffle: false,
  shuffleOrderIds: null as string[] | null,
  shuffleCursor: null as number | null,
  source: null as QueueSource,
};

const useQueueBase = create<QueueStore>()((set, get) => ({
  ...initialQueueState,
  __reset: () => {
    // Pause persistence so the subsequent rehydrate() restoring the new
    // scope's data isn't preceded by an empty-state write that would
    // clobber whatever is on disk for that scope.
    hydrated = false;
    set(() => ({ ...initialQueueState }));
  },

  // Build a new shuffle order constrained by current context (if any)
  // and ensure the current track id is placed at the cursor position.
  // This helper never escapes the store and does not mutate state directly.
  // It returns { orderIds, cursor }.
  _buildShuffleOrder: (
    state: Pick<QueueStore, "queue" | "currentIndex" | "contextIds">,
  ) => {
    const hasContext = !!(state.contextIds && state.contextIds.length > 0);
    const idsInQueue = state.queue.map((t) => t.id);
    const queueIdSet = hasContext ? new Set(idsInQueue) : null;
    const sourceIds =
      hasContext && queueIdSet
        ? (state.contextIds as string[]).filter((id) => queueIdSet.has(id))
        : idsInQueue;
    const currentId =
      state.currentIndex != null
        ? state.queue[state.currentIndex]?.id
        : undefined;
    // Shuffle everything except the current id, then pin current at index 0
    // so the full remaining order sits ahead of the cursor.
    const rest = currentId
      ? sourceIds.filter((id) => id !== currentId)
      : sourceIds.slice();
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const order = currentId ? [currentId, ...rest] : rest;
    let cursor: number | null = null;
    if (currentId) {
      cursor = order.indexOf(currentId);
      if (cursor === -1) cursor = null;
    }
    return { orderIds: order, cursor };
  },

  setQueue: (tracks, startIndex = 0, source = null) => {
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
        contextIds: nextContext && nextContext.length > 0 ? nextContext : null,
        source,
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
        source: null,
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
        currentIndex: state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
      };
      if (state.shuffle) {
        // Append new ids randomly to the remaining order after the cursor
        const newIds = items.map((t) => t.id);
        const order = (state.shuffleOrderIds ?? []).slice();
        // Insert new ids at random positions after current cursor if exists; else at end
        const startPos =
          state.shuffleCursor != null ? state.shuffleCursor + 1 : order.length;
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
        currentIndex: state.currentIndex ?? (nextQueue.length > 0 ? 0 : null),
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

  playNow: (tracks, startIndex = 0, source = null) => {
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
        contextIds: nextContext && nextContext.length > 0 ? nextContext : null,
        source,
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

  updateTrack: (id, patch) => {
    set((state) => {
      const idx = state.queue.findIndex((t) => t.id === id);
      if (idx === -1) return state;
      const nextQueue = state.queue.slice();
      nextQueue[idx] = {
        ...nextQueue[idx],
        ...patch,
        id: nextQueue[idx].id,
      };
      return { queue: nextQueue };
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
        contextIds: nextContext && nextContext.length > 0 ? nextContext : null,
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
        contextIds: nextContext && nextContext.length > 0 ? nextContext : null,
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
      if (from === to || from < 0 || to < 0 || from >= length || to >= length)
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
        const currentIdAtIdx = state.queue[state.currentIndex]?.id;
        let order = state.shuffleOrderIds;
        const cursor =
          state.shuffleCursor ??
          (currentIdAtIdx != null ? order.indexOf(currentIdAtIdx) : -1);
        // If removing played, drop current from order and queue before advancing
        if (state.removePlayed && currentIdAtIdx) {
          order = order.filter((id) => id !== currentIdAtIdx);
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
            const targetIndex = getQueueIndexById(targetId);
            return {
              currentIndex: targetIndex >= 0 ? targetIndex : state.currentIndex,
              shuffleOrderIds: order,
              shuffleCursor: nextCursor,
            } as Partial<QueueStore>;
          }
          // End of shuffle order reached: regenerate a fresh random
          // order so shuffle loops indefinitely. Avoid immediately
          // replaying the current track when alternatives exist.
          const hasContext = !!(
            state.contextIds && state.contextIds.length > 0
          );
          const sourceIds = hasContext
            ? (state.contextIds as string[]).filter(
                (id) => getQueueIndexById(id) >= 0,
              )
            : state.queue.map((t) => t.id);
          const currentId = currentIdAtIdx;
          const pool =
            sourceIds.length > 1 && currentId
              ? sourceIds.filter((id) => id !== currentId)
              : sourceIds.slice();
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          if (pool.length === 0) {
            return { currentIndex: null } as Partial<QueueStore>;
          }
          const targetId = pool[0];
          const targetIndex = getQueueIndexById(targetId);
          return {
            currentIndex: targetIndex >= 0 ? targetIndex : state.currentIndex,
            shuffleOrderIds: pool,
            shuffleCursor: 0,
          } as Partial<QueueStore>;
        }
        {
          // removePlayed path: remove current from queue and move to next id in order (at same position)
          const nextQueue = state.queue.slice();
          nextQueue.splice(state.currentIndex, 1);
          const nextId = order[0];
          // Look up against the pre-mutation queue, then adjust for the splice.
          let nextIndex = getQueueIndexById(nextId);
          if (nextIndex > state.currentIndex) nextIndex -= 1;
          return {
            queue: nextQueue,
            currentIndex:
              nextQueue.length === 0 ? null : nextIndex >= 0 ? nextIndex : 0,
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
          const targetIndex = getQueueIndexById(ids[nextPos]);
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
        const nextIndex = Math.min(state.currentIndex, nextQueue.length - 1);
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
        const order = state.shuffleOrderIds;
        const cursor =
          state.shuffleCursor ??
          (state.currentIndex != null
            ? order.indexOf(state.queue[state.currentIndex].id)
            : -1);
        const prevCursor = cursor == null ? -1 : cursor - 1;
        if (prevCursor >= 0) {
          const targetId = order[prevCursor];
          const targetIndex = getQueueIndexById(targetId);
          return {
            currentIndex: targetIndex >= 0 ? targetIndex : state.currentIndex,
            shuffleCursor: prevCursor,
          } as Partial<QueueStore>;
        }
        if (isRepeatAll) {
          const lastId = order[order.length - 1];
          const targetIndex = getQueueIndexById(lastId);
          return {
            currentIndex: targetIndex >= 0 ? targetIndex : state.currentIndex,
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
          const targetIndex = getQueueIndexById(ids[prevPos]);
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
}));

// Shared id→index map for the queue. Rebuilt only when `queue` reference
// changes, so callers that need to translate a track id to its position can
// do it in O(1) instead of walking the array.
let queueIndexById = new Map<string, number>();
const rebuildQueueIndex = (queue: QueueTrack[]) => {
  const m = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) m.set(queue[i].id, i);
  queueIndexById = m;
};
rebuildQueueIndex(useQueueBase.getState().queue);

export const getQueueIndexById = (id: string): number =>
  queueIndexById.get(id) ?? -1;

useQueueBase.subscribe((next, prev) => {
  if (next.queue !== prev.queue) rebuildQueueIndex(next.queue);
});

// Pure view of the track `next()` would advance to, without mutating state.
// Mirrors next()'s decision order exactly (repeat-one, shuffle, context wrap,
// removePlayed) so gapless/crossfade preloads always target the track the
// queue will actually land on. Returns null when next() would regenerate the
// shuffle order (callers must not preload across a regeneration) or when
// playback would stop.
export function peekNextTrack(): QueueTrack | null {
  const s = useQueueBase.getState();
  if (s.queue.length === 0 || s.currentIndex == null) return null;
  if (s.repeatMode === "one") return s.queue[s.currentIndex] ?? null;

  if (s.shuffle && s.shuffleOrderIds && s.shuffleOrderIds.length > 0) {
    const currentId = s.queue[s.currentIndex]?.id;
    const order = s.shuffleOrderIds;
    if (s.removePlayed) {
      const nextId = order.find((id) => id !== currentId);
      if (nextId == null) return null;
      const idx = getQueueIndexById(nextId);
      return idx >= 0 ? (s.queue[idx] ?? null) : null;
    }
    const cursor =
      s.shuffleCursor ?? (currentId != null ? order.indexOf(currentId) : -1);
    const nextCursor = cursor + 1;
    if (nextCursor >= order.length) return null;
    const idx = getQueueIndexById(order[nextCursor]);
    return idx >= 0 ? (s.queue[idx] ?? null) : null;
  }

  if (s.repeatMode === "all" && s.contextIds && s.contextIds.length > 0) {
    const currentId = s.queue[s.currentIndex]?.id;
    const ids = s.contextIds;
    const pos = currentId ? ids.indexOf(currentId) : -1;
    const startPos = pos >= 0 ? pos : 0;
    for (let offset = 1; offset <= ids.length; offset++) {
      const idx = getQueueIndexById(ids[(startPos + offset) % ids.length]);
      if (idx >= 0) return s.queue[idx] ?? null;
    }
    return null;
  }

  if (s.removePlayed) {
    if (s.queue.length === 1) return null;
    if (s.currentIndex + 1 < s.queue.length)
      return s.queue[s.currentIndex + 1] ?? null;
    return s.queue[s.queue.length - 2] ?? null;
  }

  if (s.currentIndex + 1 < s.queue.length)
    return s.queue[s.currentIndex + 1] ?? null;
  return s.repeatMode === "all" ? (s.queue[0] ?? null) : null;
}

// Persistence is hand-rolled (instead of zustand's `persist` middleware) so
// the hot path — a track skip that only changes `currentIndex` / `shuffleCursor`
// — doesn't re-stringify the entire queue array on every set(). The queue and
// shuffle order are heavy fields that only re-serialize when their reference
// actually changes; cursor fields are tiny and rewritten on any change.
const QUEUE_STORAGE_NAME = "queueStore";
const persistedStorage = createDynamicScopedStorage(currentAuthScope);

type CursorBlob = {
  currentIndex: number | null;
  repeatMode: "off" | "all" | "one";
  contextIds: string[] | null;
  shuffle: boolean;
  shuffleCursor: number | null;
  source: QueueSource;
};

const keyQueue = `${QUEUE_STORAGE_NAME}:queue`;
const keyShuffleOrder = `${QUEUE_STORAGE_NAME}:shuffleOrder`;
const keyCursor = `${QUEUE_STORAGE_NAME}:cursor`;

const writeQueue = (queue: QueueTrack[]) => {
  try {
    persistedStorage.setItem(keyQueue, JSON.stringify(queue));
  } catch (e) {
    console.warn("[queue] persist queue failed", e);
  }
};
const writeShuffleOrder = (ids: string[] | null) => {
  try {
    persistedStorage.setItem(keyShuffleOrder, JSON.stringify(ids));
  } catch (e) {
    console.warn("[queue] persist shuffleOrder failed", e);
  }
};
const writeCursor = (s: CursorBlob) => {
  try {
    persistedStorage.setItem(keyCursor, JSON.stringify(s));
  } catch (e) {
    console.warn("[queue] persist cursor failed", e);
  }
};

let hydrated = false;
const hydrationListeners = new Set<() => void>();

useQueueBase.subscribe((next, prev) => {
  // Skip writes until the first rehydrate has run, otherwise the initial
  // default state would clobber whatever is on disk.
  if (!hydrated) return;
  if (next.queue !== prev.queue) writeQueue(next.queue);
  if (next.shuffleOrderIds !== prev.shuffleOrderIds)
    writeShuffleOrder(next.shuffleOrderIds);
  if (
    next.currentIndex !== prev.currentIndex ||
    next.repeatMode !== prev.repeatMode ||
    next.contextIds !== prev.contextIds ||
    next.shuffle !== prev.shuffle ||
    next.shuffleCursor !== prev.shuffleCursor ||
    next.source !== prev.source
  ) {
    writeCursor({
      currentIndex: next.currentIndex,
      repeatMode: next.repeatMode,
      contextIds: next.contextIds,
      shuffle: next.shuffle,
      shuffleCursor: next.shuffleCursor,
      source: next.source,
    });
  }
});

const readSync = (key: string): string | null =>
  // MMKV is synchronous; the StateStorage interface is just broader.
  persistedStorage.getItem(key) as string | null;

const rehydrate = (): Promise<void> => {
  try {
    const queueRaw = readSync(keyQueue);
    const orderRaw = readSync(keyShuffleOrder);
    const cursorRaw = readSync(keyCursor);
    const patch: Partial<QueueStore> = {};
    if (queueRaw) patch.queue = JSON.parse(queueRaw) as QueueTrack[];
    if (orderRaw)
      patch.shuffleOrderIds = JSON.parse(orderRaw) as string[] | null;
    if (cursorRaw) {
      const cursor = JSON.parse(cursorRaw) as CursorBlob;
      patch.currentIndex = cursor.currentIndex;
      patch.repeatMode = cursor.repeatMode;
      patch.contextIds = cursor.contextIds;
      patch.shuffle = cursor.shuffle;
      patch.shuffleCursor = cursor.shuffleCursor;
      patch.source = cursor.source ?? null;
    }
    if (Object.keys(patch).length > 0) {
      useQueueBase.setState(patch);
    }
  } catch (e) {
    console.warn("[queue] rehydrate failed", e);
  }
  hydrated = true;
  for (const cb of hydrationListeners) cb();
  hydrationListeners.clear();
  return Promise.resolve();
};

const persist = {
  rehydrate,
  hasHydrated: () => hydrated,
  onFinishHydration: (cb: () => void) => {
    if (hydrated) {
      cb();
      return () => {};
    }
    hydrationListeners.add(cb);
    return () => hydrationListeners.delete(cb);
  },
};

const useQueue = Object.assign(createSelectors(useQueueBase), { persist });

export default useQueue;
