import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Audiobookshelf connection, persisted per (server, user) like AudioMuse: a
// book queued on one music server lives in that scope's queue, so its account,
// progress and downloads have to live there too.

export interface AbsLibraryOption {
  id: string;
  name: string;
}

export type AbsFavoriteKind = "book" | "series" | "author";

// Audiobookshelf has no favorites of its own, so these stay on this device.
export interface AbsFavorite {
  kind: AbsFavoriteKind;
  id: string;
  name: string;
  subtitle?: string;
  // The book whose cover stands in for a series.
  coverItemId?: string;
  addedAt: number;
}

interface AudiobookshelfStore {
  serverUrl: string;
  username: string;
  userId: string | null;
  accessToken: string;
  refreshToken: string;
  isConnected: boolean;
  serverVersion: string | null;
  canDownload: boolean;
  canDelete: boolean;
  libraries: AbsLibraryOption[];
  libraryId: string | null;
  favorites: AbsFavorite[];
  // Which account the favorites belong to, so a removed account's come back
  // when it signs in again and never leak into another one.
  favoritesOwner: string | null;
  setSession: (session: {
    serverUrl: string;
    username: string;
    userId: string;
    accessToken: string;
    refreshToken: string;
    serverVersion: string | null;
    canDownload: boolean;
    canDelete: boolean;
  }) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setConnected: (connected: boolean) => void;
  setPermissions: (permissions: {
    canDownload: boolean;
    canDelete: boolean;
  }) => void;
  setLibraries: (libraries: AbsLibraryOption[]) => void;
  setLibraryId: (libraryId: string | null) => void;
  toggleFavorite: (favorite: Omit<AbsFavorite, "addedAt">) => void;
  removeFavorite: (kind: AbsFavoriteKind, id: string) => void;
  clearConfig: () => void;
  __reset: () => void;
}

const initialState = {
  serverUrl: "",
  username: "",
  userId: null,
  accessToken: "",
  refreshToken: "",
  isConnected: false,
  serverVersion: null,
  canDownload: false,
  canDelete: false,
  libraries: [] as AbsLibraryOption[],
  libraryId: null,
  favorites: [] as AbsFavorite[],
  favoritesOwner: null as string | null,
};

const useAudiobookshelfBase = create<AudiobookshelfStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setSession: (session) => {
        set((state) => {
          const owner = `${session.serverUrl}|${session.userId}`;
          const sameAccount = state.favoritesOwner === owner;
          return {
            ...session,
            isConnected: true,
            favoritesOwner: owner,
            favorites: sameAccount ? state.favorites : [],
            libraryId: sameAccount ? state.libraryId : null,
          };
        });
      },
      setTokens: ({ accessToken, refreshToken }) => {
        set({ accessToken, refreshToken });
      },
      setConnected: (isConnected) => {
        set({ isConnected });
      },
      setPermissions: ({ canDownload, canDelete }) => {
        set({ canDownload, canDelete });
      },
      setLibraries: (libraries) => {
        set((state) => ({
          libraries,
          libraryId:
            state.libraryId &&
            libraries.some((library) => library.id === state.libraryId)
              ? state.libraryId
              : (libraries[0]?.id ?? null),
        }));
      },
      setLibraryId: (libraryId) => {
        set({ libraryId });
      },
      toggleFavorite: (favorite) => {
        set((state) => {
          const exists = state.favorites.some(
            (f) => f.kind === favorite.kind && f.id === favorite.id,
          );
          return {
            favorites: exists
              ? state.favorites.filter(
                  (f) => !(f.kind === favorite.kind && f.id === favorite.id),
                )
              : [{ ...favorite, addedAt: Date.now() }, ...state.favorites],
          };
        });
      },
      removeFavorite: (kind, id) => {
        set((state) => ({
          favorites: state.favorites.filter(
            (f) => !(f.kind === kind && f.id === id),
          ),
        }));
      },
      clearConfig: () => {
        set((state) => ({
          ...initialState,
          favorites: state.favorites,
          favoritesOwner: state.favoritesOwner,
        }));
      },
    }),
    {
      name: "audiobookshelfStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        username: state.username,
        userId: state.userId,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isConnected: state.isConnected,
        serverVersion: state.serverVersion,
        canDownload: state.canDownload,
        canDelete: state.canDelete,
        libraries: state.libraries,
        libraryId: state.libraryId,
        favorites: state.favorites,
        favoritesOwner: state.favoritesOwner,
      }),
    },
  ),
);

const useAudiobookshelf = createSelectors(useAudiobookshelfBase);

export function isAudiobookshelfConnected(): boolean {
  const { isConnected, serverUrl } = useAudiobookshelfBase.getState();
  return isConnected && !!serverUrl;
}

export default useAudiobookshelf;
export { useAudiobookshelfBase };
