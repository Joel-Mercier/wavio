import { pause } from "@/services/player";
import { useAuthBase } from "@/stores/auth";
import useHiddenTracks, { hiddenReasonNow } from "@/stores/hiddenTracks";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { artistMatchKeys, type HiddenMatchable } from "./match";

type HideableTrack = HiddenMatchable & {
  title?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
};

export type RemovedFromQueue = {
  track: QueueTrack;
  index: number;
  played: boolean;
}[];

const isHiddenNow = (track: QueueTrack) => hiddenReasonNow(track) != null;

// Hidden tracks never enter the queue, so the only way one is in it is being
// hidden while already queued. Every copy goes, played ones included, or a
// repeat-all wrap or "previous" would reach them. The current one is skipped by
// moving straight to the next visible track (next() would stay put on
// repeat-one), or paused on when nothing visible follows.
function pruneQueue(): RemovedFromQueue {
  const { queue, currentIndex, repeatMode, setCurrentIndex, removeAtIndices } =
    useQueue.getState();
  const hidden: number[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    if (isHiddenNow(queue[index])) hidden.push(index);
  }
  if (hidden.length === 0) return [];

  let removing = hidden;
  if (currentIndex != null && isHiddenNow(queue[currentIndex])) {
    const hiddenSet = new Set(hidden);
    const visible = (index: number) => !hiddenSet.has(index);
    let target = -1;
    for (let index = currentIndex + 1; index < queue.length; index += 1) {
      if (visible(index)) {
        target = index;
        break;
      }
    }
    if (target === -1 && repeatMode === "all") {
      target = queue.findIndex((_, index) => visible(index));
    }
    if (target === -1) {
      removing = hidden.filter((index) => index !== currentIndex);
      pause();
    } else {
      setCurrentIndex(target);
    }
  }

  if (removing.length > 0) removeAtIndices(removing);
  return removing.map((index) => ({
    track: queue[index],
    index,
    played: currentIndex != null && index <= currentIndex,
  }));
}

export function restoreToQueue(removed: RemovedFromQueue) {
  const { restoreAt, restorePlayedAt } = useQueue.getState();
  for (const { track, index, played } of [...removed].sort(
    (a, b) => a.index - b.index,
  )) {
    if (played) restorePlayedAt(track, index);
    else restoreAt(track, index);
  }
}

export function hideTrack(track: HideableTrack): RemovedFromQueue {
  useHiddenTracks.getState().hideTrack(track.id, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumId: track.albumId,
    coverArt: track.coverArt,
  });
  return pruneQueue();
}

export function unhideTrack(id: string) {
  useHiddenTracks.getState().unhideTrack(id);
}

export function allowTrack(track: HiddenMatchable) {
  const { artists } = useHiddenTracks.getState();
  const keys = artistMatchKeys(track, useAuthBase.getState().serverType).filter(
    (key) => key in artists,
  );
  useHiddenTracks.getState().allowTrack(track.id, keys);
}

export function blockArtist(artist: {
  id: string;
  name?: string;
  coverArt?: string;
}): RemovedFromQueue {
  useHiddenTracks.getState().hideArtist(artist.id, {
    name: artist.name,
    coverArt: artist.coverArt,
  });
  return pruneQueue();
}

export function allowArtist(id: string) {
  useHiddenTracks.getState().unhideArtist(id);
}
