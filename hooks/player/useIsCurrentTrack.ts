import useQueue from "@/stores/queue";

export function useIsCurrentTrack(id: string | undefined) {
  return useQueue(
    (store) =>
      id != null &&
      store.currentIndex != null &&
      store.queue[store.currentIndex]?.id === id,
  );
}
