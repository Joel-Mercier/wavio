import axios from "axios";
import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";
import { search3 } from "@/services/openSubsonic/searching";
import type {
  AlbumID3,
  AlbumInfo,
  AlbumWithSongsID3,
  ArtistInfo,
  ArtistInfo2,
  ArtistsID3,
  ArtistWithAlbumsID3,
  Child,
  Directory,
  Genres,
  Indexes,
  MusicFolders,
  PodcastEpisode,
  SimilarSongs,
  SimilarSongs2,
  SonicSimilarTracks,
  TopSongs,
  VideoInfo,
  Videos,
} from "@/services/openSubsonic/types";

export const getMusicFolders = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ musicFolders: MusicFolders }>
    >("/rest/getMusicFolders", {
      params: {},
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

export const getAlbum = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ album: AlbumWithSongsID3 }>
    >("/rest/getAlbum", {
      params: {
        id,
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

export const getAlbumInfo = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ albumInfo: AlbumInfo }>
    >("/rest/getAlbumInfo", {
      params: {
        id,
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

export const getAlbumInfo2 = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ albumInfo: AlbumInfo }>
    >("/rest/getAlbumInfo2", {
      params: {
        id,
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

export const getArtist = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ artist: ArtistWithAlbumsID3 }>
    >("/rest/getArtist", {
      params: {
        id,
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

export const getArtistInfo = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ artistInfo: ArtistInfo }>
    >("/rest/getArtistInfo", {
      params: {
        id,
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

export const getArtistInfo2 = async (
  id: string,
  {
    count,
    includeNotPresent = false,
  }: { count?: number; includeNotPresent?: boolean },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ artistInfo2: ArtistInfo2 }>
    >("/rest/getArtistInfo2", {
      params: {
        id,
        count,
        includeNotPresent,
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

export const getArtists = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ artists: ArtistsID3 }>
    >("/rest/getArtists", {
      params: {
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

export const getGenres = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ genres: Genres }>
    >("/rest/getGenres", {
      params: {},
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

export const getIndexes = async ({
  musicFolderId,
  ifModifiedSince,
}: {
  musicFolderId?: string;
  ifModifiedSince?: number;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ indexes: Indexes }>
    >("/rest/getIndexes", {
      params: {
        musicFolderId,
        ifModifiedSince,
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

export const getMusicDirectory = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ directory: Directory }>
    >("/rest/getMusicDirectory", {
      params: {
        id,
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

export const getPodcastEpisode = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ podcastEpisode: PodcastEpisode }>
    >("/rest/getPodcastEpisode", {
      params: {
        id,
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

export const getSimilarSongs = async (
  id: string,
  { count }: { count?: number },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ similarSongs: SimilarSongs }>
    >("/rest/getSimilarSongs", {
      params: {
        id,
        count,
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

export const getSimilarSongs2 = async (
  id: string,
  { count }: { count?: number },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ similarSongs2: SimilarSongs2 }>
    >("/rest/getSimilarSongs2", {
      params: {
        id,
        count,
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

export const getSonicSimilarTracks = async (
  id: string,
  { count }: { count?: number },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ sonicSimilarTracks: SonicSimilarTracks }>
    >("/rest/getSonicSimilarTracks", {
      params: {
        id,
        count,
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

export const getSong = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ song: Child }>
    >("/rest/getSong", {
      params: {
        id,
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

export const getTopSongs = async (
  artist: string,
  { count }: { count?: number },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ topSongs: TopSongs }>
    >("/rest/getTopSongs", {
      params: {
        artist,
        count,
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

export const getVideoInfo = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ videoInfo: VideoInfo }>
    >("/rest/getVideoInfo", {
      params: {
        id,
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

export const getVideos = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ videos: Videos }>
    >("/rest/getVideos", {
      params: {},
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

export const getArtistAppearances = async (
  id: string,
  { name, musicFolderId }: { name?: string; musicFolderId?: string } = {},
) => {
  const album: AlbumID3[] = [];
  if (!name) {
    return { artistAppearances: { album }, status: "ok" as const };
  }
  const [searchRsp, artistRsp] = await Promise.all([
    search3(name, {
      artistCount: 0,
      albumCount: 0,
      songCount: 500,
      musicFolderId,
    }),
    openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ artist: ArtistWithAlbumsID3 }>
    >("/rest/getArtist", { params: { id } }),
  ]);
  const ownAlbumIds = new Set<string>();
  if (artistRsp.data["subsonic-response"]?.status === "ok") {
    for (const a of artistRsp.data["subsonic-response"].artist.album ?? []) {
      ownAlbumIds.add(a.id);
    }
  }
  const seen = new Set<string>();
  for (const song of searchRsp.searchResult3?.song ?? []) {
    if (!song.albumId || song.artistId === id) continue;
    if (ownAlbumIds.has(song.albumId) || seen.has(song.albumId)) continue;
    if (!song.artists?.some((a) => a.id === id)) continue;
    seen.add(song.albumId);
    album.push({
      id: song.albumId,
      name: song.album ?? "",
      artist: song.artist,
      artistId: song.artistId,
      coverArt: song.coverArt,
      year: song.year,
      created: song.created ?? new Date(),
      duration: 0,
      songCount: 0,
    });
  }
  return { artistAppearances: { album }, status: "ok" as const };
};
