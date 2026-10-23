import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";
import {
  folderKey,
  type PlaylistFolderAssignments,
  type PlaylistFolderColor,
  type PlaylistFolderRecord,
} from "@/utils/playlistFolders";
import type { TrackSortType } from "@/utils/trackSort";

// Every field in utils/trackSort, per playlist. `addedAt` is the playlist's own
// order (server order with the manual reorder overlay applied).
export type PlaylistSortType = TrackSortType;

// undefined drops the playlist's assignment, so detection decides again.
export type PlaylistFolderAssignmentUpdates = Record<
  string,
  string | null | undefined
>;

const applyAssignmentUpdates = (
  assignments: PlaylistFolderAssignments,
  updates: PlaylistFolderAssignmentUpdates,
) => {
  for (const [playlistId, value] of Object.entries(updates)) {
    if (value === undefined) delete assignments[playlistId];
    else assignments[playlistId] = value;
  }
  return assignments;
};

interface PlaylistsStore {
  playlistSorts: Record<string, PlaylistSortType>;
  getPlaylistSort: (playlistId: string) => PlaylistSortType;
  setPlaylistSort: (playlistId: string, sort: PlaylistSortType) => void;
  playlistTrackOrders: Record<string, string[]>;
  getPlaylistTrackOrder: (playlistId: string) => string[] | undefined;
  setPlaylistTrackOrder: (playlistId: string, order: string[]) => void;
  clearPlaylistTrackOrder: (playlistId: string) => void;
  clearPlaylistPreferences: (playlistId: string) => void;
  deletedPlaylists: Record<string, true>;
  markPlaylistDeleted: (playlistId: string) => void;
  reconcileDeletedPlaylists: (existingIds: string[]) => void;
  // Smart playlist id → the static playlist holding a frozen copy of its
  // tracks. Both sides are server playlist ids.
  smartPlaylistSnapshots: Record<string, string>;
  setSmartPlaylistSnapshot: (smartId: string, snapshotId: string) => void;
  clearSmartPlaylistSnapshot: (smartId: string) => void;
  clearSnapshotLinksTo: (snapshotId: string) => void;
  playlistFolders: Record<string, PlaylistFolderRecord>;
  playlistFolderAssignments: PlaylistFolderAssignments;
  // Old key → new key for folders renamed this session, so a folder screen
  // opened under the old key can follow the rename. Not persisted.
  playlistFolderRenames: Record<string, string>;
  // Creates, edits or renames (previousKey) a folder, carrying every
  // assignment to the old key over to the new one.
  savePlaylistFolder: (
    previousKey: string | null,
    folder: {
      name: string;
      color: PlaylistFolderColor | null;
      createdAt?: number;
    },
    updates: PlaylistFolderAssignmentUpdates,
  ) => void;
  deletePlaylistFolder: (
    key: string,
    updates: PlaylistFolderAssignmentUpdates,
  ) => void;
  setPlaylistFolderAssignments: (
    updates: PlaylistFolderAssignmentUpdates,
  ) => void;
  __reset: () => void;
}

const usePlaylistsBase = create<PlaylistsStore>()(
  persist(
    (set, get) => ({
      playlistSorts: {},
      getPlaylistSort: (playlistId: string) => {
        const state = get();
        return state.playlistSorts[playlistId] ?? "addedAtAsc";
      },
      setPlaylistSort: (playlistId: string, sort: PlaylistSortType) => {
        set((state) => ({
          playlistSorts: {
            ...state.playlistSorts,
            [playlistId]: sort,
          },
        }));
      },
      playlistTrackOrders: {},
      getPlaylistTrackOrder: (playlistId: string) => {
        const state = get();
        return state.playlistTrackOrders[playlistId];
      },
      setPlaylistTrackOrder: (playlistId: string, order: string[]) => {
        set((state) => ({
          playlistTrackOrders: {
            ...state.playlistTrackOrders,
            [playlistId]: order,
          },
        }));
      },
      clearPlaylistTrackOrder: (playlistId: string) => {
        set((state) => {
          const { [playlistId]: _, ...rest } = state.playlistTrackOrders;
          return {
            playlistTrackOrders: rest,
          };
        });
      },
      // Everything this store remembers about a playlist that no longer exists.
      // The early return is outside set() on purpose: persist writes the whole
      // store back to MMKV on every set(), even one that changes nothing.
      clearPlaylistPreferences: (playlistId: string) => {
        const state = get();
        // A snapshot link names two playlists, so the gone id can be on either
        // side of it: the smart playlist that owns the link, or the static copy
        // it points at.
        const staleLinks = Object.entries(state.smartPlaylistSnapshots).filter(
          ([smartId, snapshotId]) =>
            smartId === playlistId || snapshotId === playlistId,
        );
        if (
          !(playlistId in state.playlistSorts) &&
          !(playlistId in state.playlistTrackOrders) &&
          !(playlistId in state.playlistFolderAssignments) &&
          staleLinks.length === 0
        ) {
          return;
        }
        const { [playlistId]: _sort, ...playlistSorts } = state.playlistSorts;
        const { [playlistId]: _order, ...playlistTrackOrders } =
          state.playlistTrackOrders;
        const { [playlistId]: _folder, ...playlistFolderAssignments } =
          state.playlistFolderAssignments;
        const smartPlaylistSnapshots = { ...state.smartPlaylistSnapshots };
        for (const [smartId] of staleLinks)
          delete smartPlaylistSnapshots[smartId];
        set({
          playlistSorts,
          playlistTrackOrders,
          playlistFolderAssignments,
          smartPlaylistSnapshots,
        });
      },
      // Ids the server no longer has. Persisted because a shortcut kept for its
      // downloads outlives the session that discovered the deletion, and every
      // reopen would otherwise re-request the playlist — which Navidrome's
      // native endpoint answers with a 500 (WAVIO-H3).
      deletedPlaylists: {},
      markPlaylistDeleted: (playlistId: string) => {
        const state = get();
        if (state.deletedPlaylists[playlistId]) return;
        set({
          deletedPlaylists: { ...state.deletedPlaylists, [playlistId]: true },
        });
      },
      // Servers that number playlists sequentially can hand a retired id to a
      // new playlist, so a marker only holds until that id shows up in a
      // listing again.
      //
      // Only ever a positive assertion. `getPlaylists` takes a `username`
      // filter (ProfileScreen passes one), so an absent id means "not in this
      // listing", not "gone from the server" — never prune anything here.
      reconcileDeletedPlaylists: (existingIds: string[]) => {
        const state = get();
        const revived = existingIds.filter((id) => state.deletedPlaylists[id]);
        if (!revived.length) return;
        const deletedPlaylists = { ...state.deletedPlaylists };
        for (const id of revived) {
          delete deletedPlaylists[id];
        }
        set({ deletedPlaylists });
      },
      smartPlaylistSnapshots: {},
      setSmartPlaylistSnapshot: (smartId: string, snapshotId: string) => {
        set((state) => ({
          smartPlaylistSnapshots: {
            ...state.smartPlaylistSnapshots,
            [smartId]: snapshotId,
          },
        }));
      },
      clearSmartPlaylistSnapshot: (smartId: string) => {
        const state = get();
        if (!(smartId in state.smartPlaylistSnapshots)) return;
        const { [smartId]: _snapshot, ...smartPlaylistSnapshots } =
          state.smartPlaylistSnapshots;
        set({ smartPlaylistSnapshots });
      },
      // The other side of the link: the static copy is gone, so the link is
      // dead whatever became of the smart playlist that owns it.
      clearSnapshotLinksTo: (snapshotId: string) => {
        const state = get();
        const owners = Object.keys(state.smartPlaylistSnapshots).filter(
          (smartId) => state.smartPlaylistSnapshots[smartId] === snapshotId,
        );
        if (owners.length === 0) return;
        const smartPlaylistSnapshots = { ...state.smartPlaylistSnapshots };
        for (const smartId of owners) delete smartPlaylistSnapshots[smartId];
        set({ smartPlaylistSnapshots });
      },
      playlistFolders: {},
      playlistFolderAssignments: {},
      playlistFolderRenames: {},
      savePlaylistFolder: (previousKey, folder, updates) => {
        const state = get();
        const key = folderKey(folder.name);
        const playlistFolders = { ...state.playlistFolders };
        const previous =
          (previousKey ? playlistFolders[previousKey] : undefined) ??
          playlistFolders[key];
        if (previousKey) delete playlistFolders[previousKey];
        const renamedFrom = [
          ...new Set([
            ...(previous?.renamedFrom ?? []),
            ...(previousKey ? [previousKey] : []),
          ]),
        ].filter((from) => from !== key);
        playlistFolders[key] = {
          name: folder.name.trim(),
          color: folder.color,
          createdAt: previous?.createdAt ?? folder.createdAt ?? Date.now(),
          ...(renamedFrom.length > 0 && { renamedFrom }),
        };
        const playlistFolderAssignments = Object.fromEntries(
          Object.entries(state.playlistFolderAssignments).map(
            ([playlistId, assigned]) => [
              playlistId,
              previousKey && assigned === previousKey ? key : assigned,
            ],
          ),
        );
        const playlistFolderRenames =
          previousKey && previousKey !== key
            ? {
                ...Object.fromEntries(
                  Object.entries(state.playlistFolderRenames).map(
                    ([from, to]) => [from, to === previousKey ? key : to],
                  ),
                ),
                [previousKey]: key,
              }
            : state.playlistFolderRenames;
        set({
          playlistFolders,
          playlistFolderAssignments: applyAssignmentUpdates(
            playlistFolderAssignments,
            updates,
          ),
          playlistFolderRenames,
        });
      },
      deletePlaylistFolder: (key, updates) => {
        const state = get();
        const { [key]: _folder, ...playlistFolders } = state.playlistFolders;
        const playlistFolderAssignments = Object.fromEntries(
          Object.entries(state.playlistFolderAssignments).filter(
            ([, assigned]) => assigned !== key,
          ),
        );
        set({
          playlistFolders,
          playlistFolderAssignments: applyAssignmentUpdates(
            playlistFolderAssignments,
            updates,
          ),
        });
      },
      setPlaylistFolderAssignments: (updates) => {
        set((state) => ({
          playlistFolderAssignments: applyAssignmentUpdates(
            { ...state.playlistFolderAssignments },
            updates,
          ),
        }));
      },
      __reset: () => {
        set({
          playlistSorts: {},
          playlistTrackOrders: {},
          deletedPlaylists: {},
          smartPlaylistSnapshots: {},
          playlistFolders: {},
          playlistFolderAssignments: {},
          playlistFolderRenames: {},
        });
      },
    }),
    {
      name: "playlists",
      version: 1,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: ({ playlistFolderRenames: _renames, ...state }) => state,
      // v0 persisted custom order as a per-track position map
      // (`playlistTrackPositions: Record<trackId, number>`). Rebuild the ordered
      // id list by sorting each playlist's tracks by their saved position.
      migrate: (persisted, version) => {
        const state = persisted as Partial<PlaylistsStore> & {
          playlistTrackPositions?: Record<string, Record<string, number>>;
        };
        if (version < 1 && state.playlistTrackPositions) {
          const orders: Record<string, string[]> = {};
          for (const [playlistId, positions] of Object.entries(
            state.playlistTrackPositions,
          )) {
            orders[playlistId] = Object.entries(positions)
              .sort((a, b) => a[1] - b[1])
              .map(([trackId]) => trackId);
          }
          state.playlistTrackOrders = orders;
          state.playlistTrackPositions = undefined;
        }
        return state as PlaylistsStore;
      },
    },
  ),
);

const usePlaylists = createSelectors(usePlaylistsBase);

export default usePlaylists;
