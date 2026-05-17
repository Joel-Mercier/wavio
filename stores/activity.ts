import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage, getAuthScope } from "@/config/storage";
import { useAuthBase } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

export type ActivityType = "album" | "artist" | "playlist";

export type ActivityEntry = {
  id: string;
  title: string;
  type: ActivityType;
  coverArt?: string;
  artist?: string;
  playedAt: number;
};

const MAX_ENTRIES = 100;

interface ActivityStore {
  activity: ActivityEntry[];
  recordActivity: (entry: Omit<ActivityEntry, "playedAt">) => void;
  clearActivity: () => void;
  __reset: () => void;
}

const useActivityBase = create<ActivityStore>()(
  persist(
    (set) => ({
      activity: [],
      recordActivity: (entry) => {
        set((state) => {
          const withoutDuplicate = state.activity.filter(
            (item) => !(item.id === entry.id && item.type === entry.type),
          );
          const next: ActivityEntry[] = [
            { ...entry, playedAt: Date.now() },
            ...withoutDuplicate,
          ];
          if (next.length > MAX_ENTRIES) {
            next.length = MAX_ENTRIES;
          }
          return { activity: next };
        });
      },
      clearActivity: () => {
        set({ activity: [] });
      },
      __reset: () => {
        set({ activity: [] });
      },
    }),
    {
      name: "activity",
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

const useActivity = createSelectors(useActivityBase);

export default useActivity;
