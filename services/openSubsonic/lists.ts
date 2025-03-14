import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { AlbumList, AlbumList2, NowPlaying, Songs, Starred, Starred2 } from "./types";

export const getAlbumList = async (type: "random" | "newest" | "highest" | "frequent" | "recent" | "alphabeticalByName" | "alphabeticalByArtist" | "starred" | "byYear" | "byGenre", size?: number, offset?: number, fromYear?: number, toYear?: number, genre?: string, musicFolderId?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<AlbumList>>(
    "/rest/getAlbumList",
    {
      params: {
        type,
        size,
        offset,
        fromYear,
        toYear,
        genre,
        musicFolderId
      }
    }
  );
  return rsp.data;
};

export const getAlbumList2 = async (type: "random" | "newest" | "highest" | "frequent" | "recent" | "alphabeticalByName" | "alphabeticalByArtist" | "starred" | "byYear" | "byGenre", size?: number, offset?: number, fromYear?: number, toYear?: number, genre?: string, musicFolderId?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<AlbumList2>>(
    "/rest/getAlbumList2",
    {
      params: {
        type,
        size,
        offset,
        fromYear,
        toYear,
        genre,
        musicFolderId
      }
    }
  );
  return rsp.data;
};

export const getNowPlaying = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<NowPlaying>>(
    "/rest/getNowPlaying",
    {
      params: {
      }
    }
  );
  return rsp.data;
}

export const getRandomSongs = async (size?: number, fromYear?: number, toYear?: number, genre?: string, musicFolderId?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Songs>>(
    "/rest/getRandomSongs",
    {
      params: {
        size,
        fromYear,
        toYear,
        genre,
        musicFolderId
      }
    }
  );
  return rsp.data;
};

export const getSongsByGenre = async (genre: string, count?: number, offset?: number, musicFolderId?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Songs>>(
    "/rest/getSongsByGenre",
    {
      params: {
        genre,
        count,
        offset,
        musicFolderId
      }
    }
  );
  return rsp.data;
};

export const getStarred = async (musicFolderId?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Starred>>(
    "/rest/getStarred",
    {
      params: {
        musicFolderId
      }
    }
  );
  return rsp.data;
};


export const getStarred2 = async (musicFolderId?: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Starred2>>(
    "/rest/getStarred2",
    {
      params: {
        musicFolderId
      }
    }
  );
  return rsp.data;
};