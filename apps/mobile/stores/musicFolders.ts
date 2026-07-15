import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import { useCurrentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

interface MusicFoldersStore {
  selections: Record<string, string | undefined>;
  setCurrentFolder: (scope: string, id: string | undefined) => void;
  clearScope: (scope: string) => void;
}

export const useMusicFoldersBase = create<MusicFoldersStore>()(
  persist(
    (set) => ({
      selections: {},
      setCurrentFolder: (scope, id) => {
        set((state) => ({
          selections: { ...state.selections, [scope]: id },
        }));
      },
      clearScope: (scope) => {
        set((state) => {
          const next = { ...state.selections };
          delete next[scope];
          return { selections: next };
        });
      },
    }),
    {
      name: "musicFolders",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useMusicFolders = createSelectors(useMusicFoldersBase);

export default useMusicFolders;

export const useCurrentMusicFolderId = (): string | undefined => {
  const scope = useCurrentAuthScope();
  return useMusicFoldersBase((s) => (scope ? s.selections[scope] : undefined));
};
