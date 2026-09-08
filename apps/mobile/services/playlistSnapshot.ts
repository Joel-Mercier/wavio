import {
  createPlaylist,
  getPlaylist,
  updatePlaylist,
} from "@/services/backend/playlists";
import { chunk } from "@/utils/chunk";

// Track ids travel on the query string: `subsonicRequest` issues a GET, and
// `createPlaylist`/`updatePlaylist` serialize `songId`/`songIdToAdd` as one
// repeated param each. A 500-track playlist of 22-char Navidrome ids is ~14 KB
// of URL, well past the 8 KB request line most reverse proxies allow, so every
// write here is chunked.
//
// Both backends' `updatePlaylist` chunk `songIdToAdd` themselves now, but the
// chunking stays here too: `createPlaylist` — which the first chunk below goes
// through — does not.
export const SNAPSHOT_CHUNK_SIZE = 100;

/**
 * Freezes a track list into a new regular playlist and returns its id.
 *
 * The point of a snapshot is that nothing re-evaluates it: a smart playlist
 * sorted at random redraws its members every time the server re-runs the
 * criteria, which is what makes it unusable as a stable offline download. A
 * plain playlist holds whatever it was given until someone changes it.
 */
export async function createSnapshot(
  name: string,
  trackIds: string[],
): Promise<string> {
  const [first, ...rest] = chunk(trackIds, SNAPSHOT_CHUNK_SIZE);
  const created = await createPlaylist(name, first ?? []);
  const id = created.playlist?.id;
  if (!id) throw new Error("Playlist was created without an id");
  for (const ids of rest) {
    await updatePlaylist(id, { songIdToAdd: ids });
  }
  return id;
}

/**
 * Repoints an existing snapshot at a new track list, in place.
 *
 * The id has to survive: it's what the offline download, the queue and the home
 * shortcut are keyed by, so delete-and-recreate would drop all three and force
 * a full re-download — the very churn a snapshot exists to avoid.
 */
export async function refreshSnapshot(
  snapshotId: string,
  trackIds: string[],
): Promise<void> {
  const existing = await getPlaylist(snapshotId);
  const currentCount = existing.playlist?.entry?.length ?? 0;

  // Add before removing, even though it means the copy holds both memberships
  // for a moment: each chunk is its own request, so a connection lost halfway
  // through leaves a playlist with duplicates — recoverable by refreshing
  // again — where removing first would leave an empty one, destroying the
  // frozen copy the snapshot exists to keep.
  for (const songIdToAdd of chunk(trackIds, SNAPSHOT_CHUNK_SIZE)) {
    await updatePlaylist(snapshotId, { songIdToAdd });
  }

  // The new tracks were appended, so the old ones still hold indices
  // 0..currentCount-1. Descending, because every removal shifts the indices
  // after it: taking 0..n in order would delete the wrong tracks from the
  // second chunk onwards.
  const indices = Array.from({ length: currentCount }, (_, i) =>
    String(currentCount - 1 - i),
  );
  for (const songIndexToRemove of chunk(indices, SNAPSHOT_CHUNK_SIZE)) {
    await updatePlaylist(snapshotId, { songIndexToRemove });
  }
}
