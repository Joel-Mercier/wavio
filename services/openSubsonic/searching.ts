import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { SearchResult, SearchResult2, SearchResult3 } from "./types";

export const search = async ({ artist, album, title, any, count, offset, newerThan }: { artist?: string, album?: string, title?: string, any?: string, count?: number, offset?: number, newerThan?: number }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<SearchResult>>(
    "/rest/search",
    {
      params: {
        artist,
        album,
        title,
        any,
        count,
        offset,
        newerThan
      }
    }
  );
  return rsp.data;
};

export const search2 = async (query: string, { artistCount, artistOffset, albumCount, albumOffset, songCount, songOffset, musicFolderId }: { artistCount?: number, artistOffset?: number, albumCount?: number, albumOffset?: number, songCount?: number, songOffset?: number, musicFolderId?: string }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<SearchResult2>>(
    "/rest/search2",
    {
      params: {
        query,
        artistCount,
        artistOffset,
        albumCount,
        albumOffset,
        songCount,
        songOffset,
        musicFolderId
      }
    }
  );
  return rsp.data;
};

export const search3 = async (query: string, { artistCount, artistOffset, albumCount, albumOffset, songCount, songOffset, musicFolderId }: { artistCount?: number, artistOffset?: number, albumCount?: number, albumOffset?: number, songCount?: number, songOffset?: number, musicFolderId?: string }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<SearchResult3>>(
    "/rest/search3",
    {
      params: {
        query,
        artistCount,
        artistOffset,
        albumCount,
        albumOffset,
        songCount,
        songOffset,
        musicFolderId
      }
    }
  );
  return rsp.data;
};