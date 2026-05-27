import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  type AlbumListType,
  getAlbumList,
  getAlbumList2,
  getNowPlaying,
  getRandomSongs,
  getSongsByGenre,
  getStarred,
  getStarred2,
} from "@/services/backend/lists";

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

export const useAlbumList2 = (
  params: {
    type: AlbumListType;
    size?: number;
    offset?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["albumList2", params],
    queryFn: () => {
      const { type, ...rest } = params;
      return getAlbumList2(type, rest);
    },
    enabled: options?.enabled,
  });
};

export const useInfiniteAlbumList2 = (
  params: {
    type: AlbumListType;
    size?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
  options?: { enabled?: boolean },
) => {
  const size = params.size ?? 20;
  return useInfiniteQuery({
    queryKey: ["albumList2:infinite", { ...params, size }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const { type, ...rest } = params;
      return getAlbumList2(type, { ...rest, size, offset: pageParam });
    },
    getNextPageParam: (lastPage, allPages) => {
      const albums = lastPage?.albumList2?.album ?? [];
      if (albums.length < size) {
        return undefined;
      }
      return allPages.length * size;
    },
    enabled: options?.enabled,
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

export const useNowPlaying = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ["nowPlaying"],
    queryFn: () => {
      return getNowPlaying();
    },
    // What others are listening to changes constantly — keep it fresh.
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    enabled: options?.enabled,
  });
};

export const useRandomSongs = (
  params: {
    size?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["randomSongs", params],
    queryFn: () => {
      return getRandomSongs(params);
    },
    enabled: options?.enabled,
  });
};

export const useSongsByGenre = (
  params: {
    genre: string;
    count?: number;
    offset?: number;
    musicFolderId?: string;
  },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["songsByGenre", params],
    queryFn: () => {
      const { genre, ...rest } = params;
      return getSongsByGenre(genre, rest);
    },
    enabled: options?.enabled,
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

export const useStarred2 = (
  params: { musicFolderId?: string },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["starred2", params],
    queryFn: () => {
      return getStarred2(params);
    },
    enabled: options?.enabled,
  });
};
