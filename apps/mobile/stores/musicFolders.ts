import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import { useCurrentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// `undefined` is "all libraries"; an empty list never gets stored.
export type MusicFolderSelection = string[] | undefined;

interface MusicFoldersStore {
  selections: Record<string, MusicFolderSelection>;
  setCurrentFolders: (scope: string, ids: MusicFolderSelection) => void;
  clearScope: (scope: string) => void;
}

// Before multi-library selection a scope held a single folder id.
export function normalizeMusicFolderSelection(
  value: unknown,
): MusicFolderSelection {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return undefined;
  const ids = [
    ...new Set(value.filter((id): id is string => typeof id === "string")),
  ];
  return ids.length > 0 ? ids : undefined;
}

export const useMusicFoldersBase = create<MusicFoldersStore>()(
  persist(
    (set) => ({
      selections: {},
      setCurrentFolders: (scope, ids) => {
        set((state) => ({
          selections: {
            ...state.selections,
            [scope]: normalizeMusicFolderSelection(ids),
          },
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
      version: 1,
      migrate: (persisted) => {
        const selections =
          (persisted as { selections?: Record<string, unknown> } | undefined)
            ?.selections ?? {};
        return {
          selections: Object.fromEntries(
            Object.entries(selections).map(([scope, value]) => [
              scope,
              normalizeMusicFolderSelection(value),
            ]),
          ),
        } as MusicFoldersStore;
      },
    },
  ),
);

const useMusicFolders = createSelectors(useMusicFoldersBase);

export default useMusicFolders;

export const useCurrentMusicFolderIds = (): MusicFolderSelection => {
  const scope = useCurrentAuthScope();
  return useMusicFoldersBase((s) => (scope ? s.selections[scope] : undefined));
};
