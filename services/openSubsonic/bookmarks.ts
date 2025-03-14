import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { Bookmarks, PlayQueue } from "./types";

export const createBookmark = async (id: string, position: number, comment?: string) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<never>>(
    "/rest/createBookmark",
    {
      id,
      position,
      comment
    }
  );
  return rsp.data;
};

export const deleteBookmark = async (id: string) => {
  const rsp = await openSubsonicApiInstance.delete<OpenSubsonicResponse<never>>(
    "/rest/deleteBookmark",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getBookmarks = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Bookmarks>>(
    "/rest/getBookmarks",
    {
      params: {

      }
    }
  );
  return rsp.data;
};

export const getPlayQueue = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<PlayQueue>>(
    "/rest/getPlayQueue",
    {
      params: {

      }
    }
  );
  return rsp.data;
};

export const savePlayQueue = async (id?: string, current?: string, position?: number) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<PlayQueue>>(
    "/rest/savePlayQueue",
    {
      id,
      current,
      position,
    }
  );
  return rsp.data;
};