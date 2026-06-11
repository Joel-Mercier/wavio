import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

const MAX_BOOKMARKS_PER_TRACK = 50;
const DEDUPE_WINDOW = 1;

interface BookmarksStore {
  bookmarks: Record<string, number[]>;
  addBookmark: (trackId: string, position: number) => void;
  removeBookmark: (trackId: string, position: number) => void;
  clearTrackBookmarks: (trackId: string) => void;
  __reset: () => void;
}

const useBookmarksBase = create<BookmarksStore>()(
  persist(
    (set) => ({
      bookmarks: {},
      addBookmark: (trackId: string, position: number) => {
        const pos = Math.max(0, Math.round(position));
        set((state) => {
          const existing = state.bookmarks[trackId] ?? [];
          if (existing.some((p) => Math.abs(p - pos) <= DEDUPE_WINDOW)) {
            return state;
          }
          const next = [...existing, pos]
            .sort((a, b) => a - b)
            .slice(0, MAX_BOOKMARKS_PER_TRACK);
          return { bookmarks: { ...state.bookmarks, [trackId]: next } };
        });
      },
      removeBookmark: (trackId: string, position: number) => {
        set((state) => {
          const existing = state.bookmarks[trackId];
          if (!existing) return state;
          const next = existing.filter((p) => p !== position);
          const bookmarks = { ...state.bookmarks };
          if (next.length === 0) {
            delete bookmarks[trackId];
          } else {
            bookmarks[trackId] = next;
          }
          return { bookmarks };
        });
      },
      clearTrackBookmarks: (trackId: string) => {
        set((state) => {
          if (!state.bookmarks[trackId]) return state;
          const bookmarks = { ...state.bookmarks };
          delete bookmarks[trackId];
          return { bookmarks };
        });
      },
      __reset: () => {
        set({ bookmarks: {} });
      },
    }),
    {
      name: "bookmarks",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(() => {
          const { url, username } = useAuthBase.getState();
          return getAuthScope(url, username);
        }),
      ),
      skipHydration: true,
    },
  ),
);

const useBookmarks = createSelectors(useBookmarksBase);

export default useBookmarks;
