import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";

// iOS folders the user picked from the Files app for the on-device library,
// keyed by the root id that `local-folder://<rootId>/…` URIs carry. The
// bookmark is what re-opens security-scoped access on the next launch (see
// modules/scoped-folders); the label is the folder name at pick time, since a
// bookmark is opaque and the resolved path isn't user-readable.
//
// Global rather than per-(server, user) scope: there is a single local library
// per device, and the grants belong to the device, not to a session.
export type ScopedFolderEntry = {
  bookmark: string;
  label: string;
};

interface ScopedFoldersStore {
  folders: Record<string, ScopedFolderEntry>;
  setFolder: (rootId: string, entry: ScopedFolderEntry) => void;
  setBookmark: (rootId: string, bookmark: string) => void;
  removeFolder: (rootId: string) => void;
}

const useScopedFolders = create<ScopedFoldersStore>()(
  persist(
    (set) => ({
      folders: {},
      setFolder: (rootId, entry) =>
        set((state) => ({ folders: { ...state.folders, [rootId]: entry } })),
      setBookmark: (rootId, bookmark) =>
        set((state) => {
          const existing = state.folders[rootId];
          if (!existing || existing.bookmark === bookmark) return state;
          return {
            folders: { ...state.folders, [rootId]: { ...existing, bookmark } },
          };
        }),
      removeFolder: (rootId) =>
        set((state) => {
          if (!state.folders[rootId]) return state;
          const folders = { ...state.folders };
          delete folders[rootId];
          return { folders };
        }),
    }),
    {
      name: "scoped-folders",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

export default useScopedFolders;
