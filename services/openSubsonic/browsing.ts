import openSubsonicApiInstance, { type OpenSubsonicResponse } from "@/services/openSubsonic";
import type { AlbumInfo, AlbumWithSongsID3, Artist, ArtistInfo, ArtistInfo2, ArtistsID3, Child, Directory, Genres, Indexes, MusicFolder, MusicFolders, PodcastEpisode, SimilarSongs, SimilarSongs2, TopSongs, VideoInfo, Videos } from "./types";

export const getMusicFolders = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<MusicFolders>>(
    "/rest/getMusicFolders",
    {
      params: {}
    }
  );
  return rsp.data;
};

export const getAlbum = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<AlbumWithSongsID3>>(
    "/rest/getAlbum",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getAlbumInfo = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<AlbumInfo>>(
    "/rest/getAlbumInfo",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getAlbumInfo2 = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<AlbumInfo>>(
    "/rest/getAlbumInfo2",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getArtist = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Artist>>(
    "/rest/getArtist",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getArtistInfo = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<ArtistInfo>>(
    "/rest/getArtistInfo",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getArtistInfo2 = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<ArtistInfo2>>(
    "/rest/getArtistInfo2",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getArtists = async ({ musicFolderId }: { musicFolderId?: string }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<ArtistsID3>>(
    "/rest/getArtists",
    {
      params: {
        musicFolderId
      }
    }
  );
  return rsp.data;
};

export const getGenres = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Genres>>(
    "/rest/getGenres",
    {
      params: {}
    }
  );
  return rsp.data;
};

export const getIndexes = async ({ musicFolderId, ifModifiedSince }: { musicFolderId?: string, ifModifiedSince?: number }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Indexes>>(
    "/rest/getIndexes",
    {
      params: {
        musicFolderId,
        ifModifiedSince,
      }
    }
  );
  return rsp.data;
};

export const getMusicDirectory = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Directory>>(
    "/rest/getMusicDirectory",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getPodcastEpisode = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<PodcastEpisode>>(
    "/rest/getPodcastEpisode",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getSimilarSongs = async (id: string, { count }: { count?: number }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<SimilarSongs>>(
    "/rest/getSimilarSongs",
    {
      params: {
        id,
        count
      }
    }
  );
  return rsp.data;
};

export const getSimilarSongs2 = async (id: string, { count }: { count?: number }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<SimilarSongs2>>(
    "/rest/getSimilarSongs2",
    {
      params: {
        id,
        count
      }
    }
  );
  return rsp.data;
};

export const getSong = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Child>>(
    "/rest/getSong",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getTopSongs = async (artist: string, { count }: { count?: number }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<TopSongs>>(
    "/rest/getTopSongs",
    {
      params: {
        artist,
        count
      }
    }
  );
  return rsp.data;
};

export const getVideoInfo = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<VideoInfo>>(
    "/rest/getVideoInfo",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getVideos = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Videos>>(
    "/rest/getVideos",
    {
      params: {
      }
    }
  );
  return rsp.data;
};