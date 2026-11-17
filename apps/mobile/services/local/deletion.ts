import { activeFileSource } from "@/services/fileSource";
import { getLocalLibraryDb } from "@/services/local/db";
import { deleteTracksByIds } from "@/services/local/indexer";
import useLocalLibrary from "@/stores/localLibrary";
import { logError } from "@/utils/log";

type DeletableRow = { id: string; uri: string; lyrics_sidecar: string | null };

/**
 * Deletes one indexed track's file and drops it from the index.
 *
 * Its lyrics sidecar goes too, unless another track still uses the same file
 * (`Song.lrc` can match both `Song.mp3` and `Song.flac`). Losing the sidecar is
 * not worth failing the delete over, so that part is best effort.
 */
export async function deleteTrack(id: string): Promise<void> {
  const db = await getLocalLibraryDb();
  const row = await db.getFirstAsync<DeletableRow>(
    "SELECT id, uri, lyrics_sidecar FROM tracks WHERE id = ?",
    id,
  );
  if (!row) return;
  const source = activeFileSource();
  await source.delete(row.uri);
  await deleteTracksByIds(db, [row.id]);
  useLocalLibrary.getState().unstar({ id: row.id });

  if (!row.lyrics_sidecar) return;
  const shared = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM tracks WHERE lyrics_sidecar = ? LIMIT 1",
    row.lyrics_sidecar,
  );
  if (shared) return;
  try {
    await source.delete(row.lyrics_sidecar);
  } catch (error) {
    logError("[localLibrary] Failed to delete lyrics sidecar", error);
  }
}

/** Device deletes are synchronous native calls, so overlapping them buys nothing. */
export const deleteConcurrency = (): number =>
  activeFileSource().kind === "device" ? 1 : 4;
