import useQueue, {
  type QueueSource,
  sourceShuffleActive,
} from "@/stores/queue";

export function useSourceShuffle(source: QueueSource) {
  const active = useQueue((state) => sourceShuffleActive(state, source));
  const toggle = () => useQueue.getState().setSourceShuffle(source, !active);
  return { active, toggle };
}
