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
  playlistTrackPositions: Record<string, Record<string, number>>;
  getPlaylistTrackPositions: (
    playlistId: string,
  ) => Record<string, number> | undefined;
  setPlaylistTrackPositions: (
    playlistId: string,
    positions: Record<string, number>,
  ) => void;
  getTrackPosition: (playlistId: string, trackId: string) => number | undefined;
  setTrackPosition: (
    playlistId: string,
    trackId: string,
    position: number,
  ) => void;
  clearPlaylistTrackPositions: (playlistId: string) => void;
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
      playlistTrackPositions: {},
      getPlaylistTrackPositions: (playlistId: string) => {
        const state = get();
        return state.playlistTrackPositions[playlistId];
      },
      setPlaylistTrackPositions: (
        playlistId: string,
        positions: Record<string, number>,
      ) => {
        set((state) => ({
          playlistTrackPositions: {
            ...state.playlistTrackPositions,
            [playlistId]: positions,
          },
        }));
      },
      getTrackPosition: (playlistId: string, trackId: string) => {
        const state = get();
        return state.playlistTrackPositions[playlistId]?.[trackId];
      },
      setTrackPosition: (
        playlistId: string,
        trackId: string,
        position: number,
      ) => {
        set((state) => {
          const currentPositions =
            state.playlistTrackPositions[playlistId] || {};
          return {
            playlistTrackPositions: {
              ...state.playlistTrackPositions,
              [playlistId]: {
                ...currentPositions,
                [trackId]: position,
              },
            },
          };
        });
      },
      clearPlaylistTrackPositions: (playlistId: string) => {
        set((state) => {
          const { [playlistId]: _, ...rest } = state.playlistTrackPositions;
          return {
            playlistTrackPositions: rest,
          };
        });
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
