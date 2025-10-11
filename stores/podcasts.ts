import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PodcastsStore {
  taddyPodcastsApiKey: string;
  taddyPodcastsUserId: string;
  setTaddyPodcastsConfig: ({
    apiKey,
    userId,
  }: { apiKey: string; userId: string }) => void;
  clearTaddyPodcastsConfig: () => void;
}

export const usePodcastsBase = create<PodcastsStore>()(
  persist(
    (set) => ({
      taddyPodcastsApiKey: "",
      taddyPodcastsUserId: "",
      setTaddyPodcastsConfig: ({ apiKey, userId }) => {
        set({ taddyPodcastsApiKey: apiKey, taddyPodcastsUserId: userId });
      },
      clearTaddyPodcastsConfig: () => {
        set({ taddyPodcastsApiKey: "", taddyPodcastsUserId: "" });
      },
    }),
    {
      name: "podcasts",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const usePodcasts = createSelectors(usePodcastsBase);

export default usePodcasts;
