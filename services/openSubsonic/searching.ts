import axios from "axios";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { SearchResult, SearchResult2, SearchResult3 } from "./types";

export const search = async ({
  artist,
  album,
  title,
  any,
  count,
  offset,
  newerThan,
}: {
  artist?: string;
  album?: string;
  title?: string;
  any?: string;
  count?: number;
  offset?: number;
  newerThan?: number;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ searchResult: SearchResult }>
    >("/rest/search", {
      params: {
        artist,
        album,
        title,
        any,
        count,
        offset,
        newerThan,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const search2 = async (
  query: string,
  {
    artistCount,
    artistOffset,
    albumCount,
    albumOffset,
    songCount,
    songOffset,
    musicFolderId,
  }: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
    musicFolderId?: string;
  },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ searchResult2: SearchResult2 }>
    >("/rest/search2", {
      params: {
        query,
        artistCount,
        artistOffset,
        albumCount,
        albumOffset,
        songCount,
        songOffset,
        musicFolderId,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const search3 = async (
  query: string,
  {
    artistCount,
    artistOffset,
    albumCount,
    albumOffset,
    songCount,
    songOffset,
    musicFolderId,
  }: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
    musicFolderId?: string;
  },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ searchResult3: SearchResult3 }>
    >("/rest/search3", {
      params: {
        query,
        artistCount,
        artistOffset,
        albumCount,
        albumOffset,
        songCount,
        songOffset,
        musicFolderId,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};
