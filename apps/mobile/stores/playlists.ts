import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";
import type { TrackSortType } from "@/utils/trackSort";

// Every field in utils/trackSort, per playlist. `addedAt` is the playlist's own
// order (server order with the manual reorder overlay applied).
export type PlaylistSortType = TrackSortType;

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
        if (
          !(playlistId in state.playlistSorts) &&
          !(playlistId in state.playlistTrackOrders)
        ) {
          return;
        }
        const { [playlistId]: _sort, ...playlistSorts } = state.playlistSorts;
        const { [playlistId]: _order, ...playlistTrackOrders } =
          state.playlistTrackOrders;
        set({ playlistSorts, playlistTrackOrders });
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
    }),
    {
      name: "playlists",
      version: 1,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
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
