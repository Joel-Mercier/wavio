import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

export type StarTarget =
  | { kind: "song"; id: string }
  | { kind: "album"; id: string }
  | { kind: "artist"; id: string };

export type OfflineAction =
  | { type: "star"; target: StarTarget; starred: boolean }
  | { type: "setRating"; id: string; rating: number }
  | { type: "playlistAddSongs"; playlistId: string; songIds: string[] }
  | { type: "playlistRemoveSongs"; playlistId: string; songIds: string[] }
  | {
      type: "playlistEdit";
      playlistId: string;
      name?: string;
      comment?: string;
      isPublic?: boolean;
    }
  | { type: "playlistDelete"; playlistId: string };

export type QueuedMutation = {
  id: string;
  createdAt: number;
  retryCount: number;
  status: "pending" | "inFlight";
  label?: string;
  action: OfflineAction;
};

export const playlistIdOf = (action: OfflineAction): string | undefined =>
  "playlistId" in action ? action.playlistId : undefined;

const sameStarTarget = (a: StarTarget, b: StarTarget) =>
  a.kind === b.kind && a.id === b.id;

const findLastPlaylistActionIndex = (
  queue: QueuedMutation[],
  playlistId: string,
) => {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (playlistIdOf(queue[i].action) === playlistId) return i;
  }
  return -1;
};

const stripUndefined = <T extends object>(obj: T): Partial<T> => {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key as keyof T] = value as T[keyof T];
  }
  return result;
};

// Dedupes the incoming action against the pending queue. Actions are deltas
// relative to the last-synced server state, so a toggle pair (star → unstar)
// nets to nothing and playlist add/remove of the same song cancel out. The
// relative order of the surviving actions targeting the same playlist is
// preserved: remove-X-then-re-add-X means "move X to the end" and must stay
// two server calls, so adds only merge into an adjacent trailing add.
export function applyEnqueue(
  queue: QueuedMutation[],
  action: OfflineAction,
  makeItem: (action: OfflineAction) => QueuedMutation,
): QueuedMutation[] {
  switch (action.type) {
    case "star": {
      const existingIndex = queue.findIndex(
        (item) =>
          item.action.type === "star" &&
          sameStarTarget(item.action.target, action.target),
      );
      if (existingIndex >= 0) {
        const existing = queue[existingIndex].action as Extract<
          OfflineAction,
          { type: "star" }
        >;
        if (existing.starred === action.starred) return queue;
        return queue.filter((_, i) => i !== existingIndex);
      }
      return [...queue, makeItem(action)];
    }
    case "setRating": {
      const existingIndex = queue.findIndex(
        (item) =>
          item.action.type === "setRating" && item.action.id === action.id,
      );
      if (existingIndex >= 0) {
        const next = [...queue];
        next[existingIndex] = { ...next[existingIndex], action };
        return next;
      }
      return [...queue, makeItem(action)];
    }
    case "playlistAddSongs": {
      const lastIndex = findLastPlaylistActionIndex(queue, action.playlistId);
      if (
        lastIndex >= 0 &&
        queue[lastIndex].action.type === "playlistAddSongs"
      ) {
        const next = [...queue];
        const existing = next[lastIndex].action as Extract<
          OfflineAction,
          { type: "playlistAddSongs" }
        >;
        next[lastIndex] = {
          ...next[lastIndex],
          action: {
            ...existing,
            songIds: [...existing.songIds, ...action.songIds],
          },
        };
        return next;
      }
      return [...queue, makeItem(action)];
    }
    case "playlistRemoveSongs": {
      let next = [...queue];
      const leftover: string[] = [];
      for (const songId of action.songIds) {
        let cancelled = false;
        for (let i = next.length - 1; i >= 0; i--) {
          const item = next[i];
          if (
            item.action.type !== "playlistAddSongs" ||
            item.action.playlistId !== action.playlistId
          ) {
            continue;
          }
          const occurrence = item.action.songIds.lastIndexOf(songId);
          if (occurrence < 0) continue;
          const songIds = [...item.action.songIds];
          songIds.splice(occurrence, 1);
          if (songIds.length === 0) {
            next = next.filter((_, j) => j !== i);
          } else {
            next[i] = { ...item, action: { ...item.action, songIds } };
          }
          cancelled = true;
          break;
        }
        if (!cancelled) leftover.push(songId);
      }
      if (leftover.length === 0) return next;
      const lastIndex = findLastPlaylistActionIndex(next, action.playlistId);
      if (
        lastIndex >= 0 &&
        next[lastIndex].action.type === "playlistRemoveSongs"
      ) {
        const existing = next[lastIndex].action as Extract<
          OfflineAction,
          { type: "playlistRemoveSongs" }
        >;
        next[lastIndex] = {
          ...next[lastIndex],
          action: {
            ...existing,
            songIds: [...existing.songIds, ...leftover],
          },
        };
        return next;
      }
      return [...next, makeItem({ ...action, songIds: leftover })];
    }
    case "playlistEdit": {
      const existingIndex = queue.findIndex(
        (item) =>
          item.action.type === "playlistEdit" &&
          item.action.playlistId === action.playlistId,
      );
      if (existingIndex >= 0) {
        const existing = queue[existingIndex].action as Extract<
          OfflineAction,
          { type: "playlistEdit" }
        >;
        const next = [...queue];
        next[existingIndex] = {
          ...next[existingIndex],
          action: { ...existing, ...stripUndefined(action) },
        };
        return next;
      }
      return [...queue, makeItem(action)];
    }
    case "playlistDelete": {
      const next = queue.filter(
        (item) => playlistIdOf(item.action) !== action.playlistId,
      );
      return [...next, makeItem(action)];
    }
  }
}

interface OfflineMutationsStore {
  queue: QueuedMutation[];
  enqueue: (action: OfflineAction, label?: string) => void;
  remove: (ids: string[]) => void;
  bumpRetry: (id: string) => void;
  setStatus: (id: string, status: QueuedMutation["status"]) => void;
  removeForPlaylist: (playlistId: string) => void;
  clear: () => void;
  __reset: () => void;
}

let idCounter = 0;

const useOfflineMutationsBase = create<OfflineMutationsStore>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (action, label) => {
        set((state) => ({
          queue: applyEnqueue(state.queue, action, (a) => ({
            id: `${Date.now().toString(36)}-${idCounter++}`,
            createdAt: Date.now(),
            retryCount: 0,
            status: "pending",
            label,
            action: a,
          })),
        }));
      },
      remove: (ids) => {
        set((state) => ({
          queue: state.queue.filter((item) => !ids.includes(item.id)),
        }));
      },
      bumpRetry: (id) => {
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id
              ? { ...item, retryCount: item.retryCount + 1, status: "pending" }
              : item,
          ),
        }));
      },
      setStatus: (id, status) => {
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, status } : item,
          ),
        }));
      },
      removeForPlaylist: (playlistId) => {
        set((state) => ({
          queue: state.queue.filter(
            (item) => playlistIdOf(item.action) !== playlistId,
          ),
        }));
      },
      clear: () => {
        set({ queue: [] });
      },
      __reset: () => {
        set({ queue: [] });
      },
    }),
    {
      name: "offlineMutations",
      version: 1,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
      partialize: (state) => ({ queue: state.queue }),
    },
  ),
);

const useOfflineMutations = createSelectors(useOfflineMutationsBase);

export default useOfflineMutations;
