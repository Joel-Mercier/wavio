import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  AlbumList,
  AlbumList2,
  NowPlaying,
  Songs,
  Starred,
  Starred2,
} from "@/services/openSubsonic/types";

export type AlbumListType =
  | "random"
  | "newest"
  | "highest"
  | "frequent"
  | "recent"
  | "alphabeticalByName"
  | "alphabeticalByArtist"
  | "starred"
  | "byYear"
  | "byGenre";

export const getAlbumList = async (
  type: AlbumListType,
  {
    size,
    offset,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  }: {
    size?: number;
    offset?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
) =>
  subsonicRequest<{ albumList: AlbumList }>("/rest/getAlbumList", {
    type,
    size,
    offset,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  });

export const getAlbumList2 = async (
  type: AlbumListType,
  {
    size,
    offset,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  }: {
    size?: number;
    offset?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
) =>
  subsonicRequest<{ albumList2: AlbumList2 }>("/rest/getAlbumList2", {
    type,
    size,
    offset,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  });

export const getNowPlaying = async () =>
  subsonicRequest<{ nowPlaying: NowPlaying }>("/rest/getNowPlaying");

export const getRandomSongs = async ({
  size,
  fromYear,
  toYear,
  genre,
  musicFolderId,
}: {
  size?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
}) =>
  subsonicRequest<{ songs: Songs }>("/rest/getRandomSongs", {
    size,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  });

export const getSongsByGenre = async (
  genre: string,
  {
    count,
    offset,
    musicFolderId,
  }: { count?: number; offset?: number; musicFolderId?: string },
) =>
  subsonicRequest<{ songs: Songs }>("/rest/getSongsByGenre", {
    genre,
    count,
    offset,
    musicFolderId,
  });

export const getStarred = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) =>
  subsonicRequest<{ starred: Starred }>("/rest/getStarred", { musicFolderId });

export const getStarred2 = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) =>
  subsonicRequest<{ starred2: Starred2 }>("/rest/getStarred2", {
    musicFolderId,
  });
