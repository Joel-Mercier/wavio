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
  getArtistSongs,
  getArtists,
  getGenres,
  getIndexes,
  getMusicDirectory,
  getMusicFolders,
  getSimilarSongs,
  getSimilarSongs2,
  getVideoInfo,
  getVideos,
} from "@/services/backend/browsing";
import { fetchSimilarSongs } from "@/services/similarSongs";
import { fetchTopSongs } from "@/services/topSongs";
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
    refetchOnMount: "always",
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
    refetchOnMount: "always",
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

export const useArtistSongs = (id: string) => {
  return useQuery({
    queryKey: ["artistSongs", id],
    queryFn: () => {
      return getArtistSongs(id);
    },
    enabled: !!id,
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

export const useGenres = (
  params: { musicFolderId?: string } = {},
  options?: { enabled?: boolean },
) => {
  const query = useQuery({
    queryKey: ["genres", params],
    queryFn: () => {
      return getGenres(params);
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

// Returns a flat Child[] of an artist's top songs, resolved by artist id where
// the server supports it and by display name otherwise (see
// services/topSongs.ts).
//
// The key never depends on that support, only on whether the caller holds an
// id: `hasExtension` reads a non-persisted store that stays empty until an
// online extensions fetch lands, so a capability-derived key would be written
// under the id offline and read under the name — an artist screen opened
// offline would find nothing and render empty for good. Entries are persisted
// for 7 days (config/queryClient.ts), so id callers orphan their name-keyed
// entries once on upgrade; that costs at most one offline session per artist.
// The "topSongs" prefix is what STARRED_AFFECTED_KEYS invalidates, so it stays
// first on both shapes.
export const useTopSongs = (
  artist: string,
  { count, id }: { count?: number; id?: string },
) => {
  const capabilities = useCapabilities();
  const hasTopSongsByArtistId = useServerExtensionsBase((s) =>
    s.hasExtension("topSongsByArtistId"),
  );
  const byId =
    !!id && (capabilities.topSongsByArtistId || hasTopSongsByArtistId);
  return useQuery({
    queryKey: id
      ? ["topSongs", { id, count }]
      : ["topSongs", artist, { count }],
    queryFn: () => fetchTopSongs({ id, name: artist, count }),
    enabled: byId || !!artist,
  });
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
