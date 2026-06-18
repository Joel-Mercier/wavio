import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  getAlbum,
  getAlbumInfo,
  getAlbumInfo2,
  getArtist,
  getArtistAppearances,
  getArtistInfo,
  getArtistInfo2,
  getArtists,
  getGenres,
  getIndexes,
  getMusicDirectory,
  getMusicFolders,
  getSimilarSongs,
  getSimilarSongs2,
  getTopSongs,
  getVideoInfo,
  getVideos,
} from "@/services/backend/browsing";
import { fetchSimilarSongs } from "@/services/similarSongs";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

export const useMusicFolders = () => {
  return useQuery({
    queryKey: ["musicFolders"],
    queryFn: () => {
      return getMusicFolders();
    },
  });
};

export const useAlbum = (id: string) => {
  const query = useQuery({
    queryKey: ["album", id],
    queryFn: () => {
      return getAlbum(id);
    },
  });

  return query;
};

export const useAlbumInfo = (id: string) => {
  const { extendedMetadata } = useCapabilities();
  const query = useQuery({
    queryKey: ["albumInfo", id],
    queryFn: () => {
      return getAlbumInfo(id);
    },
    enabled: !!id && extendedMetadata,
  });

  return query;
};

export const useAlbumInfo2 = (id: string) => {
  const { extendedMetadata } = useCapabilities();
  const query = useQuery({
    queryKey: ["albumInfo2", id],
    queryFn: () => {
      return getAlbumInfo2(id);
    },
    enabled: !!id && extendedMetadata,
  });

  return query;
};

export const useArtist = (id: string, options?: { enabled?: boolean }) => {
  const query = useQuery({
    queryKey: ["artist", id],
    queryFn: () => {
      return getArtist(id);
    },
    enabled: !!id && options?.enabled !== false,
  });

  return query;
};

export const useArtistAppearances = (
  id: string,
  params: { name?: string; musicFolderId?: string },
) => {
  return useQuery({
    queryKey: ["artistAppearances", id, params],
    queryFn: () => {
      return getArtistAppearances(id, params);
    },
    enabled: !!id && !!params.name,
  });
};

export const useArtistInfo = (id: string) => {
  const { extendedMetadata } = useCapabilities();
  const query = useQuery({
    queryKey: ["artistInfo", id],
    queryFn: () => {
      return getArtistInfo(id);
    },
    enabled: !!id && extendedMetadata,
  });

  return query;
};

export const useArtistInfo2 = (
  id: string,
  params: { count?: number; includeNotPresent?: boolean },
) => {
  const { extendedMetadata } = useCapabilities();
  const query = useQuery({
    queryKey: ["artistInfo2", id, params],
    queryFn: () => {
      return getArtistInfo2(id, params);
    },
    enabled: !!id && extendedMetadata,
  });

  return query;
};

export const useArtists = (
  params: { musicFolderId?: string },
  options?: { enabled?: boolean },
) => {
  const query = useQuery({
    queryKey: ["artists", params],
    queryFn: () => {
      return getArtists(params);
    },
    enabled: options?.enabled,
  });

  return query;
};

export const useIndexes = (params: {
  musicFolderId?: string;
  ifModifiedSince?: number;
}) => {
  const query = useQuery({
    queryKey: ["indexes", params],
    queryFn: () => {
      return getIndexes(params);
    },
  });

  return query;
};

export const useGenres = (options?: { enabled?: boolean }) => {
  const query = useQuery({
    queryKey: ["genres"],
    queryFn: () => {
      return getGenres();
    },
    enabled: options?.enabled,
  });

  return query;
};

export const useMusicDirectory = (id: string) => {
  const query = useQuery({
    queryKey: ["musicDirectory", id],
    queryFn: () => {
      return getMusicDirectory(id);
    },
    enabled: !!id,
  });

  return query;
};

export const useSimilarSongs = (id: string, params: { count?: number }) => {
  const query = useQuery({
    queryKey: ["similarSongs", id, params],
    queryFn: () => {
      return getSimilarSongs(id, params);
    },
  });

  return query;
};

export const useSimilarSongs2 = (id: string, params: { count?: number }) => {
  const query = useQuery({
    queryKey: ["similarSongs2", id, params],
    queryFn: () => {
      return getSimilarSongs2(id, params);
    },
  });

  return query;
};

// Returns a flat Child[] of similar songs, preferring the sonicSimilarity
// extension when available (see services/similarSongs.ts). The extension flag is
// part of the query key so results refetch when switching to a server with a
// different capability.
export const useSimilarTracks = (id: string, params: { count?: number }) => {
  const hasSonicSimilarity = useServerExtensionsBase((s) =>
    s.hasExtension("sonicSimilarity"),
  );
  return useQuery({
    queryKey: ["similarTracks", id, params, hasSonicSimilarity],
    queryFn: () => fetchSimilarSongs(id, params.count),
    enabled: !!id,
  });
};

export const useTopSongs = (artist: string, params: { count?: number }) => {
  const query = useQuery({
    queryKey: ["topSongs", artist, params],
    queryFn: () => {
      return getTopSongs(artist, params);
    },
    enabled: !!artist,
  });

  return query;
};

export const useVideoInfo = (id: string) => {
  const query = useQuery({
    queryKey: ["videoInfo", id],
    queryFn: () => {
      return getVideoInfo(id);
    },
  });

  return query;
};

export const useVideos = () => {
  const query = useQuery({
    queryKey: ["videos"],
    queryFn: () => {
      return getVideos();
    },
  });

  return query;
};
