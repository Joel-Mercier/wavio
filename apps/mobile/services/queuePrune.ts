import { moveToIndex, pause } from "@/services/player";
import useQueue, { type QueueTrack } from "@/stores/queue";

export type RemovedFromQueue = {
  track: QueueTrack;
  index: number;
  played: boolean;
}[];

/**
 * Takes every queued track matching `shouldRemove` out of the queue, played ones
 * included, or a repeat-all wrap or "previous" would reach them. The current one
 * is skipped by moving straight to the next track that stays (next() would stay
 * put on repeat-one), which only starts playing if the removed one was.
 *
 * When nothing follows it, `whenNothingFollows` decides: `"pause"` keeps it as
 * the current track, paused, which suits a track that still exists; `"stop"`
 * empties the queue, for one whose file is gone. Removing it alone would make
 * the track before it current, and every player (local or remote) reads a new
 * current track as a cue to play it.
 */
export function removeFromQueueWhere(
  shouldRemove: (track: QueueTrack) => boolean,
  {
    whenNothingFollows = "pause",
  }: { whenNothingFollows?: "pause" | "stop" } = {},
): RemovedFromQueue {
  const { queue, currentIndex, repeatMode, removeAtIndices, clearQueue } =
    useQueue.getState();
  const matching: number[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    if (shouldRemove(queue[index])) matching.push(index);
  }
  if (matching.length === 0) return [];

  let removing = matching;
  if (currentIndex != null && shouldRemove(queue[currentIndex])) {
    const matchingSet = new Set(matching);
    const stays = (index: number) => !matchingSet.has(index);
    let target = -1;
    for (let index = currentIndex + 1; index < queue.length; index += 1) {
      if (stays(index)) {
        target = index;
        break;
      }
    }
    if (target === -1 && repeatMode === "all") {
      target = queue.findIndex((_, index) => stays(index));
    }
    if (target === -1 && whenNothingFollows === "stop") {
      pause();
      clearQueue();
      return entriesAt(queue, currentIndex, matching);
    }
    if (target === -1) {
      removing = matching.filter((index) => index !== currentIndex);
      pause();
    } else {
      moveToIndex(target);
    }
  }

  if (removing.length > 0) removeAtIndices(removing);
  return entriesAt(queue, currentIndex, removing);
}

const entriesAt = (
  queue: QueueTrack[],
  currentIndex: number | null,
  indices: number[],
): RemovedFromQueue =>
  indices.map((index) => ({
    track: queue[index],
    index,
    played: currentIndex != null && index <= currentIndex,
  }));

export function restoreToQueue(removed: RemovedFromQueue) {
  const { restoreAt, restorePlayedAt } = useQueue.getState();
  for (const { track, index, played } of [...removed].sort(
    (a, b) => a.index - b.index,
  )) {
    if (played) restorePlayedAt(track, index);
    else restoreAt(track, index);
  }
}

/**
 * Puts back only the removed entries `keep` accepts. Each slot is shifted back
 * by the entries before it that stay out, since the queue never got those back.
 */
export function restoreSomeToQueue(
  removed: RemovedFromQueue,
  keep: (track: QueueTrack) => boolean,
) {
  let skipped = 0;
  const kept: RemovedFromQueue = [];
  for (const entry of [...removed].sort((a, b) => a.index - b.index)) {
    if (keep(entry.track))
      kept.push({ ...entry, index: entry.index - skipped });
    else skipped += 1;
  }
  restoreToQueue(kept);
}
