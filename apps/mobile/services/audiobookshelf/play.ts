import {
  ensureAudiobookSession,
  getAudiobookPosition,
  getAudiobookSnapshot,
  isAudiobookTrack,
  reconcileAudiobookPosition,
  requestAudiobookStart,
  setAudiobookFinished,
} from "@/services/audiobookPlayback";
import { absServerUrl } from "@/services/audiobookshelf/index";
import { getLibraryItem } from "@/services/audiobookshelf/library";
import type { AbsLibraryItem } from "@/services/audiobookshelf/types";
import { getIsOnline } from "@/services/network";
import {
  isPlaying,
  play,
  playTracks,
  seekAudiobookTo,
  togglePlayPause,
} from "@/services/player";
import { useAudiobookDownloadsBase } from "@/stores/audiobookDownloads";
import {
  type AudiobookSnapshot,
  useAudiobookProgressBase,
} from "@/stores/audiobookProgress";
import { isAudiobookshelfConnected } from "@/stores/audiobookshelf";
import useQueue from "@/stores/queue";
import { locateInBook } from "@/utils/audiobookTimeline";
import { audiobookToTracks, snapshotFromItem } from "@/utils/audiobookToTrack";

export class AudiobookUnavailableError extends Error {
  constructor() {
    super("Audiobook unavailable");
    this.name = "AudiobookUnavailableError";
  }
}

/** Save what the player needs to know about a book, keeping downloaded ones. */
export function rememberAudiobook(
  item: AbsLibraryItem,
): AudiobookSnapshot | null {
  const snapshot = snapshotFromItem(item);
  if (!snapshot) return null;
  const downloaded = new Set(
    Object.keys(useAudiobookDownloadsBase.getState().downloads),
  );
  useAudiobookProgressBase.getState().saveBook(snapshot, downloaded);
  reconcileAudiobookPosition(item.id, item.userMediaProgress ?? null);
  return snapshot;
}

async function resolveSnapshot(
  itemId: string,
  item?: AbsLibraryItem,
): Promise<AudiobookSnapshot> {
  if (item?.media.tracks?.length) {
    const snapshot = rememberAudiobook(item);
    if (snapshot) return snapshot;
  }
  if (getIsOnline() && isAudiobookshelfConnected()) {
    try {
      const fetched = await getLibraryItem(itemId);
      const snapshot = rememberAudiobook(fetched);
      if (snapshot) return snapshot;
    } catch (error) {
      const cached = getAudiobookSnapshot(itemId);
      if (cached) return cached;
      throw error;
    }
  }
  const cached = getAudiobookSnapshot(itemId);
  if (cached) return cached;
  throw new AudiobookUnavailableError();
}

export function isPlayingBook(itemId: string): boolean {
  const current = useQueue.getState().getCurrent();
  return isAudiobookTrack(current) && current.audiobookItemId === itemId;
}

/**
 * Play a book from where it was left (or from `startAt`, in book seconds).
 * Pressing play on the book already loaded toggles it instead.
 */
export async function playAudiobook(
  itemId: string,
  options: { startAt?: number; item?: AbsLibraryItem } = {},
): Promise<boolean> {
  if (isPlayingBook(itemId)) {
    if (options.startAt != null) {
      seekAudiobookTo(options.startAt);
      if (!isPlaying()) play();
      return true;
    }
    togglePlayPause();
    return true;
  }

  const book = await resolveSnapshot(itemId, options.item);
  const saved = useAudiobookProgressBase.getState().positions[itemId];
  let start = options.startAt ?? getAudiobookPosition(itemId) ?? 0;
  if (options.startAt == null && saved?.isFinished) {
    start = 0;
    void setAudiobookFinished(itemId, false).catch(() => {});
  }

  const tracks = audiobookToTracks(book, absServerUrl());
  const { fileIndex, offset } = locateInBook(book.files, start);
  const queue = useQueue.getState();
  // A shuffled or repeated book is never what anyone wants, and the player
  // swaps those controls out for spoken word anyway.
  if (queue.shuffle) queue.setShuffle(false);
  if (queue.repeatMode !== "off") queue.setRepeatMode("off");
  requestAudiobookStart(tracks[fileIndex].id, offset);
  const started = playTracks(tracks, fileIndex, {
    source: { type: "audiobook", name: book.title, id: book.itemId },
  });
  if (started) {
    const current = useQueue.getState().getCurrent();
    if (current) void ensureAudiobookSession(current);
  }
  return started;
}
