import {
  type AlbumListType,
  getAlbumList,
  getAlbumList2,
  getNowPlaying,
  getRandomSongs,
  getSongsByGenre,
  getStarred,
  getStarred2,
} from "@/services/openSubsonic/lists";
import { useQuery } from "@tanstack/react-query";

export const useAlbumList = (params: {
  type: AlbumListType;
  size?: number;
  offset?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
}) => {
  return useQuery({
    queryKey: ["albumList", params],
    queryFn: () => {
      const { type, ...rest } = params;
      return getAlbumList(type, rest);
    },
  });
};

export const useAlbumList2 = (params: {
  type: AlbumListType;
  size?: number;
  offset?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
}) => {
  return useQuery({
    queryKey: ["albumList2", params],
    queryFn: () => {
      const { type, ...rest } = params;
      return getAlbumList2(type, rest);
    },
  });
};

export const usePlayNow = () => {
  return useQuery({
    queryKey: ["playNow"],
    queryFn: () => {
      return getNowPlaying();
    },
  });
};

export const useRandomSongs = (params: {
  size?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
}) => {
  return useQuery({
    queryKey: ["randomSongs", params],
    queryFn: () => {
      return getRandomSongs(params);
    },
  });
};

export const useSongsByGenre = (params: {
  genre: string;
  count?: number;
  offset?: number;
  musicFolderId?: string;
}) => {
  return useQuery({
    queryKey: ["songsByGenre", params],
    queryFn: () => {
      const { genre, ...rest } = params;
      return getSongsByGenre(genre, rest);
    },
  });
};

export const useStarred = (params: { musicFolderId?: string }) => {
  return useQuery({
    queryKey: ["starred", params],
    queryFn: () => {
      return getStarred(params);
    },
  });
};

export const useStarred2 = (params: { musicFolderId?: string }) => {
  return useQuery({
    queryKey: ["starred2", params],
    queryFn: () => {
      return getStarred2(params);
    },
  });
};
