import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

export type PlaylistSortType =
  | "addedAtAsc"
  | "addedAtDesc"
  | "alphabeticalAsc"
  | "alphabeticalDesc";

interface PlaylistsStore {
  playlistSorts: Record<string, PlaylistSortType>;
  getPlaylistSort: (playlistId: string) => PlaylistSortType;
  setPlaylistSort: (playlistId: string, sort: PlaylistSortType) => void;
  playlistTrackOrders: Record<string, string[]>;
  getPlaylistTrackOrder: (playlistId: string) => string[] | undefined;
  setPlaylistTrackOrder: (playlistId: string, order: string[]) => void;
  clearPlaylistTrackOrder: (playlistId: string) => void;
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
