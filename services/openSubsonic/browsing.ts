import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic";
import axios from "axios";
import type {
  AlbumInfo,
  AlbumWithSongsID3,
  Artist,
  ArtistInfo,
  ArtistInfo2,
  ArtistWithAlbumsID3,
  ArtistsID3,
  Child,
  Directory,
  Genres,
  Indexes,
  MusicFolders,
  PodcastEpisode,
  SimilarSongs,
  SimilarSongs2,
  TopSongs,
  VideoInfo,
  Videos,
} from "./types";

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

export const getArtistInfo2 = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ artistInfo2: ArtistInfo2 }>
    >("/rest/getArtistInfo2", {
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

export const getArtists = async ({
  musicFolderId,
}: { musicFolderId?: string }) => {
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
}: { musicFolderId?: string; ifModifiedSince?: number }) => {
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
