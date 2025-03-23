import axios from "axios";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { Playlist, Playlists } from "./types";

export const createPlaylist = async (name: string, songId: string[]) => {
  try {
    const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<{ playlist: Playlist }>>(
      "/rest/createPlaylist",
      {
        name,
        songId
      }
    );
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error
    }
    throw error
  }
};

export const deletePlaylist = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.delete<OpenSubsonicResponse<Record<string, never>>>(
      "/rest/deletePlaylist",
      {
        params: {
          id
        }
      }
    );
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error
    }
    throw error
  }
};

export const getPlaylist = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<{ playlist: Playlist }>>(
      "/rest/getPlaylist",
      {
        params: {
          id
        }
      }
    );
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error
    }
    throw error
  }
};

export const getPlaylists = async ({ username }: { username?: string }) => {
  try {
    const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<{ playlists: Playlists }>>(
      "/rest/getPlaylists",
      {
        params: {
          username
        }
      }
    );
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error
    }
    throw error
  }
};

export const updatePlaylist = async (id: string, { name, comment, public, songIdToAdd, songIndexToRemove }: { name?: string, comment?: string, public?: boolean, songIdToAdd?: string[], songIndexToRemove?: string[] }) => {
  try {
    const rsp = await openSubsonicApiInstance.put<OpenSubsonicResponse<Record<string, never>>>(
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
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error
    }
    throw error
  }
};