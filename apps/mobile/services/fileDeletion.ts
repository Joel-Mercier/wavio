import axios from "axios";
import { queryClient } from "@/config/queryClient";
import { getAlbum, getArtist } from "@/services/backend/browsing";
import {
  deleteConcurrency,
  deleteTrack,
  refreshAfterDelete,
} from "@/services/backend/deletion";
import { activeServerType } from "@/services/backend/dispatch";
import { reportError } from "@/services/errorReporting";
import { fileSourceErrorCode } from "@/services/fileSource/errors";
import { isNotFoundError } from "@/services/notFound";
import { offlineDownloadService } from "@/services/offline/downloadService";
import type { Child } from "@/services/openSubsonic/types";
import { getCurrentTime, restoreServerQueue } from "@/services/player";
import {
  type RemovedFromQueue,
  removeFromQueueWhere,
  restoreSomeToQueue,
} from "@/services/queuePrune";
import useHiddenTracks from "@/stores/hiddenTracks";
import useOffline, {
  type OfflineCollection,
  type OfflineSource,
  type QueuedTrack,
} from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";

export type DeletionProgress = { done: number; total: number };

export type DeletionFailureReason =
  | "notAllowed"
  | "inUse"
  | "unreachable"
  | "serverError"
  | "other";

export type DeletionResult = {
  deleted: string[];
  failed: { id: string; reason: DeletionFailureReason }[];
  cancelled: boolean;
};

/** The tracks an album delete removes: every track the album lists. */
export async function tracksOfAlbum(id: string): Promise<Child[]> {
  const rsp = await getAlbum(id);
  return rsp.album?.song ?? [];
}

/** The tracks an artist delete removes: every track of the albums the artist page lists. */
export async function tracksOfArtist(id: string): Promise<Child[]> {
  const rsp = await getArtist(id);
  const albums = rsp.artist?.album ?? [];
  const perAlbum = await mapWithConcurrency(albums, 4, (album) =>
    tracksOfAlbum(album.id),
  );
  const seen = new Set<string>();
  return perAlbum.flat().filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function deletionFailureReason(error: unknown): DeletionFailureReason {
  const code = fileSourceErrorCode(error);
  if (code === "ERR_FS_READ_ONLY" || code === "ERR_FS_AUTH") {
    return "notAllowed";
  }
  if (code === "ERR_FS_IN_USE") return "inUse";
  if (code === "ERR_FS_UNREACHABLE") return "unreachable";
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) return "notAllowed";
    if (status === undefined) return "unreachable";
    if (status >= 500) return "serverError";
  }
  return "other";
}

export type DeletableTrack = { id: string; albumId?: string };

/**
 * Permanently deletes tracks' files and forgets every local trace of them.
 *
 * The tracks leave the play queue and the download queue first, so neither the
 * player nor the downloader holds a file open while it is being deleted (an SMB
 * server refuses to delete an open file). Whatever then couldn't be deleted is
 * put back. `isCancelled` is checked before each file: a delete already sent
 * can't be taken back, so cancelling stops after the ones in flight.
 *
 * `collectionId` is the album or artist being deleted: its track list covers
 * whole albums, so an album none of whose tracks failed is known to be gone.
 */
export async function deleteTracks(
  tracks: DeletableTrack[],
  {
    collectionId,
    onProgress,
    isCancelled = () => false,
  }: {
    collectionId?: string;
    onProgress?: (progress: DeletionProgress) => void;
    isCancelled?: () => boolean;
  } = {},
): Promise<DeletionResult> {
  const byId = new Map(tracks.map((track) => [track.id, track] as const));
  const ids = [...byId.keys()];
  const result: DeletionResult = { deleted: [], failed: [], cancelled: false };
  const total = ids.length;
  if (total === 0) return result;

  const parked = setAside(new Set(ids));

  let done = 0;
  let reported = false;
  onProgress?.({ done, total });
  await mapWithConcurrency(ids, deleteConcurrency(), async (id) => {
    if (isCancelled()) {
      result.cancelled = true;
      return;
    }
    try {
      await deleteTrack(id);
      result.deleted.push(id);
    } catch (error) {
      const reason = deletionFailureReason(error);
      result.failed.push({ id, reason });
      // Refusals, dropped links and a server that can't write its own disk
      // are user state, not bugs.
      if (reason === "other" && !reported) {
        reported = true;
        reportError(error, {
          area: "local-library",
          backend: reportBackend(),
          endpoint: "deleteTrack",
        });
      }
    }
    done += 1;
    onProgress?.({ done, total });
  });

  const deleted = new Set(result.deleted);
  putBack(parked, (id) => !deleted.has(id));
  if (deleted.size === 0) return result;

  await forgetDeletedTracks(result.deleted);
  forgetFromCollections(deleted);
  const complete = !result.cancelled && result.failed.length === 0;
  const emptied = await emptiedAlbums(
    [...byId.values()],
    deleted,
    collectionId != null,
  );
  const recentPlays = useRecentPlays.getState();
  for (const albumId of emptied) recentPlays.removeRecentPlay(albumId);
  if (collectionId && complete) recentPlays.removeRecentPlay(collectionId);
  invalidateLibraryQueries();
  if (emptied.length > 0) {
    void refreshAfterDelete(emptied)
      .then((refreshed) => {
        if (refreshed) invalidateLibraryQueries();
      })
      .catch(() => {});
  }
  return result;
}

type EmptiedQueue = { tracks: QueueTrack[]; index: number; position: number };

type SetAside = {
  queue: RemovedFromQueue;
  queueSurvivors: Set<string>;
  emptiedQueue: EmptiedQueue | null;
  downloads: QueuedTrack[];
};

function setAside(targeted: Set<string>): SetAside {
  const { queue: queueBefore, currentIndex: indexBefore } = useQueue.getState();
  const position = getCurrentTime();
  const queue = removeFromQueueWhere((track) => targeted.has(track.id), {
    whenNothingFollows: "stop",
  });
  const after = useQueue.getState();
  const emptiedQueue =
    indexBefore != null && after.currentIndex == null
      ? { tracks: queueBefore, index: indexBefore, position }
      : null;
  const queueSurvivors = new Set(after.queue.map((t) => t.id));
  const wasQueued = useOffline
    .getState()
    .downloadQueue.filter((track) => targeted.has(track.id));
  offlineDownloadService.cancelQueuedTracks(wasQueued.map((t) => t.id));
  const stillQueued = new Set(
    useOffline.getState().downloadQueue.map((t) => t.id),
  );
  const downloads = wasQueued.filter((track) => !stillQueued.has(track.id));
  return { queue, queueSurvivors, emptiedQueue, downloads };
}

function putBack(
  { queue, queueSurvivors, emptiedQueue, downloads }: SetAside,
  keep: (id: string) => boolean,
) {
  // Only into the queue they left, never into one the user started meanwhile.
  const now = useQueue.getState();
  if (emptiedQueue && now.queue.length === 0) {
    refillEmptiedQueue(emptiedQueue, keep);
  } else if (
    now.currentIndex != null &&
    now.queue.some((track) => queueSurvivors.has(track.id))
  ) {
    restoreSomeToQueue(queue, (track) => keep(track.id));
  }
  const bySource = new Map<OfflineSource, QueuedTrack[]>();
  for (const track of downloads) {
    if (!keep(track.id)) continue;
    const source = track.offlineSource ?? "user";
    bySource.set(source, [...(bySource.get(source) ?? []), track]);
  }
  for (const [source, queued] of bySource) {
    offlineDownloadService.enqueueTracks(queued, source);
  }
}

/**
 * The delete took every track from the current one on out of the queue, which
 * stopped playback. Puts back those whose file is still there, paused, at the
 * current track if it survived or else the next survivor.
 */
function refillEmptiedQueue(
  { tracks, index, position }: EmptiedQueue,
  keep: (id: string) => boolean,
) {
  const survivors = tracks
    .map((track, at) => ({ track, at }))
    .filter(({ track }) => keep(track.id));
  if (survivors.length === 0) return;
  const next = survivors.findIndex(({ at }) => at >= index);
  const current = next === -1 ? survivors.length - 1 : next;
  restoreServerQueue(
    survivors.map(({ track }) => track),
    current,
    survivors[current].at === index ? position : 0,
  );
}

async function forgetDeletedTracks(ids: string[]): Promise<void> {
  const hidden = useHiddenTracks.getState();
  for (const id of ids) {
    if (hidden.tracks[id]) hidden.unhideTrack(id);
  }
  const { downloadedTracks } = useOffline.getState();
  const downloaded = ids.filter((id) => downloadedTracks[id]);
  if (downloaded.length > 0) {
    await offlineDownloadService
      .removeDownloadedTracks(downloaded)
      .catch(() => {});
  }
}

/**
 * Drops deleted tracks from every saved collection. An album left with nothing
 * no longer exists, so its saved copy goes; a playlist still does, and keeps
 * whatever is left.
 */
function forgetFromCollections(deleted: Set<string>) {
  const offline = useOffline.getState();
  const shrunk: OfflineCollection[] = [];
  const gone: string[] = [];
  for (const collection of Object.values(offline.downloadedCollections)) {
    const trackIds = collection.trackIds.filter((id) => !deleted.has(id));
    const removed = collection.trackIds.length - trackIds.length;
    if (removed === 0) continue;
    if (trackIds.length === 0 && collection.kind === "album") {
      gone.push(collection.id);
    } else {
      shrunk.push({
        ...collection,
        trackIds,
        songCount: Math.max(0, collection.songCount - removed),
      });
    }
  }
  offline.addDownloadedCollections(shrunk);
  for (const id of gone) {
    void offlineDownloadService.removeCollection(id, []).catch(() => {});
  }
}

/**
 * The albums the delete left without a track. An album or artist delete
 * listed whole albums, so one none of whose tracks stayed is known to be
 * empty; a pick of single tracks says nothing about the rest of their album,
 * so the library is asked.
 */
async function emptiedAlbums(
  targeted: DeletableTrack[],
  deleted: Set<string>,
  coversWholeAlbums: boolean,
): Promise<string[]> {
  const albumsOf = (tracks: DeletableTrack[]) =>
    new Set(
      tracks.map((track) => track.albumId).filter((id): id is string => !!id),
    );
  const albumIds = [
    ...albumsOf(targeted.filter((track) => deleted.has(track.id))),
  ];
  if (coversWholeAlbums) {
    const kept = albumsOf(targeted.filter((track) => !deleted.has(track.id)));
    return albumIds.filter((id) => !kept.has(id));
  }
  const empty = await mapWithConcurrency(albumIds, 4, isAlbumEmpty);
  return albumIds.filter((_, index) => empty[index]);
}

// The local index forgets an album with its last track; Jellyfin answers 404 or
// lists no songs. Anything else (a dropped link, a server error) counts as not
// empty: a stale home shortcut is better than losing one for an album that
// still exists.
async function isAlbumEmpty(id: string): Promise<boolean> {
  try {
    const rsp = await getAlbum(id);
    return (rsp.album?.song ?? []).length === 0;
  } catch (error) {
    return isNotFoundError(error);
  }
}

// What a deleted file can change: the lists and pages that show tracks, and
// the counts and groupings derived from them. Lyrics, artwork, server info and
// the integrations' own caches are untouched.
const LIBRARY_QUERY_PREFIXES = new Set([
  "album",
  "albumList",
  "albumList2",
  "albumList2:infinite",
  "artist",
  "artistAppearances",
  "artistSongs:infinite",
  "artists",
  "genres",
  "indexes",
  "leastPlayedAlbums",
  "leastPlayedAlbums:infinite",
  "localLibrarySize",
  "mix",
  "mostPlayedSongs",
  "mostPlayedSongs:infinite",
  "musicDirectory",
  "playlist",
  "playlists",
  "randomSongs",
  "search",
  "search2",
  "search3",
  "similarSongs",
  "similarSongs2",
  "song",
  "songs:infinite",
  "songsByGenre",
  "starred",
  "starred2",
  "topSongs",
]);

function invalidateLibraryQueries() {
  void queryClient.invalidateQueries({
    predicate: (query) => LIBRARY_QUERY_PREFIXES.has(String(query.queryKey[0])),
  });
}

function reportBackend(): "jellyfin" | "local" | "webdav" | "smb" | undefined {
  const type = activeServerType();
  return type === "jellyfin" ||
    type === "local" ||
    type === "webdav" ||
    type === "smb"
    ? type
    : undefined;
}
