import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  type AlbumListType,
  getAlbumList,
  getAlbumList2,
  getMostPlayedSongs,
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
      // A short page isn't the end: some Subsonic servers and the Jellyfin
      // "newest" path return fewer than `size` while more items remain, so
      // stopping on a short page truncates the list. Only stop on an empty
      // page, and offset by the running total (not allPages.length * size) so
      // variable page sizes don't skip rows.
      if ((lastPage?.albumList2?.album?.length ?? 0) === 0) {
        return undefined;
      }
      return allPages.reduce(
        (total, page) => total + (page?.albumList2?.album?.length ?? 0),
        0,
      );
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

export const useMostPlayedSongs = (
  params: { size?: number; musicFolderId?: string } = {},
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["mostPlayedSongs", params],
    queryFn: () => {
      return getMostPlayedSongs(params);
    },
    enabled: options?.enabled,
  });
};

export const useInfiniteMostPlayedSongs = (
  params: { size?: number; musicFolderId?: string } = {},
) => {
  const size = params.size ?? 20;
  return useInfiniteQuery({
    queryKey: ["mostPlayedSongs:infinite", { ...params, size }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      return getMostPlayedSongs({ ...params, size, offset: pageParam });
    },
    getNextPageParam: (lastPage, allPages) => {
      // Stop only on an empty page (a short page can still have more behind it)
      // and offset by the running total so variable page sizes don't skip rows.
      if ((lastPage?.songs?.song?.length ?? 0) === 0) {
        return undefined;
      }
      return allPages.reduce(
        (total, page) => total + (page?.songs?.song?.length ?? 0),
        0,
      );
    },
  });
};

// Favorites aren't folder-scoped (see services/openSubsonic/lists.ts), so the
// query key stays constant — switching libraries no longer spawns a redundant
// per-folder favorites cache entry. musicFolderId is kept in the signature for
// caller compatibility but ignored.
export const useStarred = (_params: { musicFolderId?: string } = {}) => {
  return useQuery({
    queryKey: ["starred"],
    queryFn: () => {
      return getStarred();
    },
  });
};

export const useStarred2 = (
  _params: { musicFolderId?: string } = {},
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["starred2"],
    queryFn: () => {
      return getStarred2();
    },
    enabled: options?.enabled,
  });
};
