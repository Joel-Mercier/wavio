
import { getAlbum, getAlbumInfo, getAlbumInfo2, getArtist, getArtistInfo, getArtistInfo2, getArtists, getGenres, getIndexes, getMusicDirectory, getMusicFolders, getSimilarSongs, getSimilarSongs2, getTopSongs, getVideoInfo, getVideos } from "@/services/openSubsonic/browsing";
import { useQuery } from "@tanstack/react-query";

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
  const query = useQuery({
    queryKey: ["albumInfo", id],
    queryFn: () => {
      return getAlbumInfo(id);
    },
  });

  return query;
};

export const useAlbumInfo2 = (id: string) => {
  const query = useQuery({
    queryKey: ["albumInfo2", id],
    queryFn: () => {
      return getAlbumInfo2(id);
    },
  });

  return query;
};

export const useArtist = (id: string) => {
  const query = useQuery({
    queryKey: ["artist", id],
    queryFn: () => {
      return getArtist(id);
    },
  });

  return query;
};

export const useArtistInfo = (id: string) => {
  const query = useQuery({
    queryKey: ["artistInfo", id],
    queryFn: () => {
      return getArtistInfo(id);
    },
  });

  return query;
};

export const useArtistInfo2 = (id: string) => {
  const query = useQuery({
    queryKey: ["artistInfo2", id],
    queryFn: () => {
      return getArtistInfo2(id);
    },
  });

  return query;
};

export const useArtists = (params: { musicFolderId?: string }) => {
  const query = useQuery({
    queryKey: ["artists", params],
    queryFn: () => {
      return getArtists(params);
    },
  });

  return query;
};

export const useIndexes = (params: { musicFolderId?: string, ifModifiedSince?: number }) => {
  const query = useQuery({
    queryKey: ["indexes", params],
    queryFn: () => {
      return getIndexes(params);
    },
  });

  return query;
};

export const useGenres = () => {
  const query = useQuery({
    queryKey: ["genres"],
    queryFn: () => {
      return getGenres();
    },
  });

  return query;
};

export const useMusicDirectory = (id: string) => {
  const query = useQuery({
    queryKey: ["musicDirectory", id],
    queryFn: () => {
      return getMusicDirectory(id);
    },
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

export const useTopSongs = (artist: string, params: { count?: number }) => {
  const query = useQuery({
    queryKey: ["topSongs", artist, params],
    queryFn: () => {
      return getTopSongs(artist, params);
    },
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