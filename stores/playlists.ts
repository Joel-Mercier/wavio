import { createScopedStorage, getAuthScope } from "@/config/storage";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PlaylistSortType =
  | "addedAtAsc"
  | "addedAtDesc"
  | "alphabeticalAsc"
  | "alphabeticalDesc";

interface PlaylistsStore {
  playlistSorts: Record<string, PlaylistSortType>;
  getPlaylistSort: (playlistId: string) => PlaylistSortType;
  setPlaylistSort: (playlistId: string, sort: PlaylistSortType) => void;
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
    }),
    {
      name: "playlists",
      storage: createJSONStorage(() => {
        const { url, username } = useAuthBase.getState();
        const scope = getAuthScope(url, username);
        return createScopedStorage(scope);
      }),
      skipHydration: true,
    },
  ),
);

const usePlaylists = createSelectors(usePlaylistsBase);

export default usePlaylists;
