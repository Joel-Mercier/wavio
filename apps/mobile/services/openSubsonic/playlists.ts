import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  Playlist,
  Playlists,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";

export const createPlaylist = async (name: string, songId?: string[]) =>
  subsonicRequest<{ playlist: Playlist }>(
    "/rest/createPlaylist",
    { name, songId },
    { paramsSerializer: { indexes: null } },
  );

export const deletePlaylist = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/deletePlaylist", { id });

export const getPlaylist = async (id: string) =>
  subsonicRequest<{ playlist: PlaylistWithSongs }>(
    "/rest/getPlaylist",
    { id },
    {},
    { notFoundIsExpected: true },
  );

export const getPlaylists = async ({ username }: { username?: string }) =>
  subsonicRequest<{ playlists: Playlists }>("/rest/getPlaylists", { username });

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
) =>
  subsonicRequest<Record<string, never>>(
    "/rest/updatePlaylist",
    {
      playlistId: id,
      name,
      comment,
      public: isPublic,
      songIdToAdd,
      songIndexToRemove,
    },
    { paramsSerializer: { indexes: null } },
  );
