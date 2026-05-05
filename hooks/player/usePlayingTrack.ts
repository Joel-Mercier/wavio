import useQueue from "@/stores/queue";

export function usePlayingTrack() {
  return useQueue((store) =>
    store.currentIndex != null ? store.queue[store.currentIndex] : null,
  );
}
