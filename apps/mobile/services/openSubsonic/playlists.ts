import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  Playlist,
  Playlists,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import { chunk } from "@/utils/chunk";

// Track ids travel on the query string — this is a GET, and `songIdToAdd` is
// serialized as one repeated param per id — so a large add is split across
// several requests. A few hundred 22-char Navidrome ids is well past the 8 KB
// request line most reverse proxies allow, and the whole call comes back 414.
// Sequential, not parallel: the server appends each chunk in the order it
// arrives, and the caller's track order has to survive the split.
const SONG_ID_CHUNK_SIZE = 100;

export const createPlaylist = async (name: string, songId?: string[]) =>
  subsonicRequest<{ playlist: Playlist }>(
    "/rest/createPlaylist",
    { name, songId },
    { paramsSerializer: { indexes: null } },
  );

// Code 70 means the playlist is already gone — a stale list the user tapped
// delete on twice, or one removed from another client. The end state is the one
// asked for, so it isn't a failure worth reporting.
export const deletePlaylist = async (id: string) =>
  subsonicRequest<Record<string, never>>(
    "/rest/deletePlaylist",
    { id },
    {},
    { notFoundIsExpected: true },
  );

export const getPlaylist = async (id: string) =>
  subsonicRequest<{ playlist: PlaylistWithSongs }>(
    "/rest/getPlaylist",
    { id },
    {},
    { notFoundIsExpected: true },
  );

export const getPlaylists = async ({ username }: { username?: string }) =>
  subsonicRequest<{ playlists: Playlists }>("/rest/getPlaylists", { username });

// `songIndexToRemove` is deliberately *not* chunked. Every removal shifts the
// indices after it, so a batch is only meaningful evaluated against a single
// snapshot of the playlist; splitting it would delete the wrong tracks from the
// second request on, unless the caller happened to pass the indices in
// descending order — which this layer has no way to know. A caller removing
// enough tracks to blow the URL budget has to chunk it itself, in descending
// order, the way services/playlistSnapshot.ts does.
export const updatePlaylist = async (
  id: string,
  {
    name,
    comment,
    isPublic,
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
  const [firstChunk, ...restChunks] = songIdToAdd?.length
    ? chunk(songIdToAdd, SONG_ID_CHUNK_SIZE)
    : [];

  // The metadata and the removals ride on the first request, so a call that
  // adds nothing still behaves exactly as it did before.
  const response = await subsonicRequest<Record<string, never>>(
    "/rest/updatePlaylist",
    {
      playlistId: id,
      name,
      comment,
      public: isPublic,
      songIdToAdd: firstChunk,
      songIndexToRemove,
    },
    { paramsSerializer: { indexes: null } },
  );

  // A failure here leaves the earlier chunks added: a partial add the user can
  // recover from by retrying, where the unsplit request added nothing at all.
  for (const songIdToAddChunk of restChunks) {
    await subsonicRequest<Record<string, never>>(
      "/rest/updatePlaylist",
      { playlistId: id, songIdToAdd: songIdToAddChunk },
      { paramsSerializer: { indexes: null } },
    );
  }

  return response;
};
