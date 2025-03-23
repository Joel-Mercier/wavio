import axios from "axios";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { Bookmarks, PlayQueue } from "./types";

export const createBookmark = async (id: string, position: number, { comment }: { comment?: string }) => {
  try {
    const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<Record<string, never>>>(
      "/rest/createBookmark",
      {
        id,
        position,
        comment
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

export const deleteBookmark = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.delete<OpenSubsonicResponse<Record<string, never>>>(
      "/rest/deleteBookmark",
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

export const getBookmarks = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<{ bookmarks: Bookmarks }>>(
      "/rest/getBookmarks",
      {
        params: {

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

export const getPlayQueue = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<{ playQueue: PlayQueue }>>(
      "/rest/getPlayQueue",
      {
        params: {

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

export const savePlayQueue = async ({ id, current, position }: { id?: string, current?: string, position?: number }) => {
  try {
    const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<Record<string, never>>>(
      "/rest/savePlayQueue",
      {
        id,
        current,
        position,
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