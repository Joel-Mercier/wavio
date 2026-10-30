import { useSyncExternalStore } from "react";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";
import {
  bookTimeOf,
  getAudiobookSnapshot,
  isAudiobookTrack,
} from "@/services/audiobookPlayback";
import useQueue from "@/stores/queue";
import { chapterIndexAt } from "@/utils/audiobookTimeline";

function readChapterKey(): string {
  const track = useQueue.getState().getCurrent();
  if (!isAudiobookTrack(track)) return "";
  const book = getAudiobookSnapshot(track.audiobookItemId);
  const time = bookTimeOf(track, getPlaybackSnapshot().currentTime ?? 0);
  const chapter = book ? chapterIndexAt(book.chapters, time) : -1;
  return `${track.audiobookItemId}|${chapter}`;
}

function subscribe(callback: () => void) {
  const unsubscribeProgress = subscribePlaybackProgress(callback);
  const unsubscribeQueue = useQueue.subscribe(callback);
  return () => {
    unsubscribeProgress();
    unsubscribeQueue();
  };
}

/**
 * The chapter playing right now, re-rendering only when it changes rather than
 * on every progress tick. `itemId` is null when no audiobook is playing.
 */
export function useAudiobookChapterPlaying(): {
  itemId: string | null;
  chapterIndex: number;
} {
  const key = useSyncExternalStore(subscribe, readChapterKey);
  if (!key) return { itemId: null, chapterIndex: -1 };
  const separator = key.lastIndexOf("|");
  return {
    itemId: key.slice(0, separator),
    chapterIndex: Number(key.slice(separator + 1)),
  };
}

/** Book time of the playing audiobook, on every progress tick. */
export function useAudiobookBookTime(): number | null {
  return useSyncExternalStore(subscribe, () => {
    const track = useQueue.getState().getCurrent();
    if (!isAudiobookTrack(track)) return null;
    return Math.floor(
      bookTimeOf(track, getPlaybackSnapshot().currentTime ?? 0),
    );
  });
}
