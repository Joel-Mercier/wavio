import { newLocalPlaylistId } from "@/services/local/keys";
import { mapPlaylist, mapRowToChild } from "@/services/local/mappers";
import {
  appendPlaylistTracks,
  deletePlaylist as deletePlaylistRow,
  insertPlaylist,
  queryPlaylistById,
  queryPlaylistEntries,
  queryPlaylists,
  removePlaylistIndexes,
  updatePlaylistMeta,
} from "@/services/local/repository";
import {
  LocalUnsupportedError,
  localEnvelope,
} from "@/services/local/unsupported";
import type { PlaylistWithSongs } from "@/services/openSubsonic/types";

// On-device playlists, backed by the per-(server,user) SQLite database (see
// db.ts). Mirrors services/openSubsonic/playlists.ts so the dispatch layer and
// hooks consume identical shapes. Reordering isn't handled here — it's a
// client-side overlay (stores/playlists.ts `setPlaylistTrackPositions`) layered
// on top of every backend — so updatePlaylist only does rename / add / remove,
// exactly like Subsonic's `updatePlaylist`.

export const getPlaylists = async (_opts: { username?: string } = {}) => {
  const rows = await queryPlaylists();
  return localEnvelope({ playlists: { playlist: rows.map(mapPlaylist) } });
};

export const getPlaylist = async (id: string) => {
  const row = await queryPlaylistById(id);
  if (!row) throw new LocalUnsupportedError(`playlist "${id}" (not found)`);
  const entries = await queryPlaylistEntries(id);
  const playlist: PlaylistWithSongs = {
    ...mapPlaylist(row),
    entry: entries.map(mapRowToChild),
  };
  return localEnvelope({ playlist });
};

export const createPlaylist = async (name: string, songId?: string[]) => {
  const id = newLocalPlaylistId();
  await insertPlaylist({
    id,
    name,
    now: Date.now(),
    trackIds: songId ?? [],
  });
  const row = await queryPlaylistById(id);
  // Freshly inserted, so this is always present; fall back defensively.
  return localEnvelope({ playlist: row ? mapPlaylist(row) : { id, name } });
};

export const updatePlaylist = async (
  id: string,
  {
    name,
    comment,
    songIdToAdd,
    songIndexToRemove,
  }: {
    name?: string;
    comment?: string;
    isPublic?: boolean;
    songIdToAdd?: string[];
    songIndexToRemove?: string[];
  },
) => {
  const now = Date.now();
  if (name !== undefined || comment !== undefined) {
    await updatePlaylistMeta(id, { name, comment }, now);
  }
  // Remove before add so the removal indexes still refer to the list the caller
  // saw (additions append at the end and wouldn't shift earlier indexes anyway,
  // but this keeps the ordering intent unambiguous).
  if (songIndexToRemove?.length) {
    const indexes = songIndexToRemove
      .map((i) => Number.parseInt(i, 10))
      .filter((i) => Number.isInteger(i));
    await removePlaylistIndexes(id, indexes, now);
  }
  if (songIdToAdd?.length) {
    await appendPlaylistTracks(id, songIdToAdd, now);
  }
  return localEnvelope({});
};

export const deletePlaylist = async (id: string) => {
  await deletePlaylistRow(id);
  return localEnvelope({});
};
