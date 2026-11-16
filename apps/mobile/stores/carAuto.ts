import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import {
  ROW_KEYS,
  type RowKey,
  SECTION_KEYS,
  type SectionKey,
} from "@/services/carAuto/mediaId";
import type { ItemAction } from "@/services/carAuto/types";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

export type CarDisplayStyle = "list" | "grid";
export type CarDisplayTarget = "albums" | "playlists" | "artists" | "genres";
export type CarPlayerButton = "favorite" | "shuffle" | "repeat" | "radio";
export type CarCollectionTap = "open" | "play";

export const TAB_SECTIONS: SectionKey[] = [...SECTION_KEYS];

export const DEFAULT_TABS: SectionKey[] = [
  "home",
  "library",
  "downloads",
  "recent",
];

export const DEFAULT_HOME_ROWS: RowKey[] = [
  "recentlyPlayed",
  "newest",
  "mixes",
  "frequent",
  "random",
];

export const LIBRARY_SECTIONS: SectionKey[] = [
  "playlists",
  "artists",
  "albums",
  "genres",
  "favorites",
  "radio",
  "mixes",
  "podcasts",
  "audiobooks",
];

export const PLAYER_BUTTONS: CarPlayerButton[] = [
  "favorite",
  "shuffle",
  "repeat",
  "radio",
];

export const ITEM_ACTIONS: ItemAction[] = [
  "favoriteAdd",
  "radio",
  "playNext",
  "addToQueue",
  "shuffle",
  "download",
];

export interface CarAutoSettings {
  tabs: SectionKey[];
  homeRows: RowKey[];
  libraryEntries: SectionKey[];
  displayStyles: Record<CarDisplayTarget, CarDisplayStyle>;
  collectionTap: CarCollectionTap;
  playerButtons: Record<CarPlayerButton, boolean>;
  itemActions: Record<ItemAction, boolean>;
}

interface CarAutoStore extends CarAutoSettings {
  setTabs: (tabs: SectionKey[]) => void;
  setHomeRows: (rows: RowKey[]) => void;
  setLibraryEntries: (entries: SectionKey[]) => void;
  setDisplayStyle: (target: CarDisplayTarget, style: CarDisplayStyle) => void;
  setCollectionTap: (tap: CarCollectionTap) => void;
  setPlayerButton: (button: CarPlayerButton, enabled: boolean) => void;
  setItemAction: (action: ItemAction, enabled: boolean) => void;
  __reset: () => void;
}

export const DEFAULT_CAR_SETTINGS: CarAutoSettings = {
  tabs: DEFAULT_TABS,
  homeRows: DEFAULT_HOME_ROWS,
  libraryEntries: LIBRARY_SECTIONS,
  displayStyles: {
    albums: "grid",
    playlists: "list",
    artists: "list",
    genres: "list",
  },
  collectionTap: "open",
  playerButtons: { favorite: true, shuffle: true, repeat: true, radio: true },
  itemActions: {
    favoriteAdd: true,
    favoriteRemove: true,
    radio: true,
    playNext: true,
    addToQueue: true,
    shuffle: true,
    download: true,
  },
};

const unique = <T>(values: T[]) => [...new Set(values)];

const sanitize = (
  persisted: Partial<CarAutoSettings> | undefined,
): CarAutoSettings => ({
  tabs: unique(
    (persisted?.tabs ?? DEFAULT_TABS).filter((key) =>
      TAB_SECTIONS.includes(key),
    ),
  ),
  homeRows: unique(
    (persisted?.homeRows ?? DEFAULT_HOME_ROWS).filter((key) =>
      (ROW_KEYS as readonly string[]).includes(key),
    ),
  ),
  libraryEntries: unique(
    (persisted?.libraryEntries ?? LIBRARY_SECTIONS).filter((key) =>
      LIBRARY_SECTIONS.includes(key),
    ),
  ),
  displayStyles: {
    ...DEFAULT_CAR_SETTINGS.displayStyles,
    ...persisted?.displayStyles,
  },
  collectionTap: persisted?.collectionTap === "play" ? "play" : "open",
  playerButtons: {
    ...DEFAULT_CAR_SETTINGS.playerButtons,
    ...persisted?.playerButtons,
  },
  itemActions: {
    ...DEFAULT_CAR_SETTINGS.itemActions,
    ...persisted?.itemActions,
  },
});

const useCarAutoBase = create<CarAutoStore>()(
  persist(
    (set) => ({
      ...DEFAULT_CAR_SETTINGS,
      setTabs: (tabs) => set({ tabs: sanitize({ tabs }).tabs }),
      setHomeRows: (homeRows) =>
        set({ homeRows: sanitize({ homeRows }).homeRows }),
      setLibraryEntries: (libraryEntries) =>
        set({ libraryEntries: sanitize({ libraryEntries }).libraryEntries }),
      setDisplayStyle: (target, style) =>
        set((state) => ({
          displayStyles: { ...state.displayStyles, [target]: style },
        })),
      setCollectionTap: (collectionTap) => set({ collectionTap }),
      setPlayerButton: (button, enabled) =>
        set((state) => ({
          playerButtons: { ...state.playerButtons, [button]: enabled },
        })),
      setItemAction: (action, enabled) =>
        set((state) => ({
          itemActions: {
            ...state.itemActions,
            [action]: enabled,
            ...(action === "favoriteAdd" ? { favoriteRemove: enabled } : {}),
          },
        })),
      __reset: () => set(DEFAULT_CAR_SETTINGS),
    }),
    {
      name: "carAutoStore",
      version: 1,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: ({
        tabs,
        homeRows,
        libraryEntries,
        displayStyles,
        collectionTap,
        playerButtons,
        itemActions,
      }) => ({
        tabs,
        homeRows,
        libraryEntries,
        displayStyles,
        collectionTap,
        playerButtons,
        itemActions,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitize(persisted as Partial<CarAutoSettings> | undefined),
      }),
    },
  ),
);

export function carAutoSettings(): CarAutoSettings {
  const state = useCarAutoBase.getState();
  return {
    tabs: state.tabs,
    homeRows: state.homeRows,
    libraryEntries: state.libraryEntries,
    displayStyles: state.displayStyles,
    collectionTap: state.collectionTap,
    playerButtons: state.playerButtons,
    itemActions: state.itemActions,
  };
}

export { useCarAutoBase };

const useCarAuto = createSelectors(useCarAutoBase);

export default useCarAuto;
