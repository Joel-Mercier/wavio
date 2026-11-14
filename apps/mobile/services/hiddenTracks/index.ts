import {
  type RemovedFromQueue,
  removeFromQueueWhere,
} from "@/services/queuePrune";
import { useAuthBase } from "@/stores/auth";
import useHiddenTracks, { hiddenReasonNow } from "@/stores/hiddenTracks";
import type { QueueTrack } from "@/stores/queue";
import { artistMatchKeys, type HiddenMatchable } from "./match";

type HideableTrack = HiddenMatchable & {
  title?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
};

export type { RemovedFromQueue } from "@/services/queuePrune";
export { restoreToQueue } from "@/services/queuePrune";

const isHiddenNow = (track: QueueTrack) => hiddenReasonNow(track) != null;

// Hidden tracks never enter the queue, so the only way one is in it is being
// hidden while already queued.
const pruneQueue = (): RemovedFromQueue => removeFromQueueWhere(isHiddenNow);

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
