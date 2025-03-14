import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { Playlist, Playlists } from "./types";

export const createPlaylist = async (name: string, songId: string[]) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<Playlist>>(
    "/rest/createPlaylist",
    {
      name,
      songId
    }
  );
  return rsp.data;
};

export const deletePlaylist = async (id: string) => {
  const rsp = await openSubsonicApiInstance.delete<OpenSubsonicResponse<never>>(
    "/rest/deletePlaylist",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getPlaylist = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Playlist>>(
    "/rest/getPlaylist",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getPlaylists = async (username?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Playlists>>(
    "/rest/getPlaylists",
    {
      params: {
        username
      }
    }
  );
  return rsp.data;
};

export const updatePlaylist = async (id: string, name?: string, comment?: string, public?: boolean, songIdToAdd?: string[], songIndexToRemove?: string[]) => {
  const rsp = await openSubsonicApiInstance.put<OpenSubsonicResponse<Playlist>>(
    "/rest/updatePlaylist",
    {
      params: {
        playlistId: id,
        name,
        comment,
        public,
        songIdToAdd,
        songIndexToRemove

      }
    }
  );
  return rsp.data;
};