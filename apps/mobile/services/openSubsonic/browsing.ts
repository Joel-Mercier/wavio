import openSubsonicApiInstance, {
  folderScopedRequest,
  isSubsonicDataNotFound,
  type OpenSubsonicResponse,
  subsonicRequest,
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
  SongsExistResult,
  SonicSimilarTracks,
  TopSongs,
  VideoInfo,
  Videos,
} from "@/services/openSubsonic/types";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";

export const getMusicFolders = async () =>
  subsonicRequest<{ musicFolders: MusicFolders }>("/rest/getMusicFolders");

export const getAlbum = async (id: string) =>
  subsonicRequest<{ album: AlbumWithSongsID3 }>(
    "/rest/getAlbum",
    { id },
    {},
    { notFoundIsExpected: true },
  );

export const getAlbumInfo = async (id: string) =>
  subsonicRequest<{ albumInfo: AlbumInfo }>("/rest/getAlbumInfo", { id });

export const getAlbumInfo2 = async (id: string) =>
  subsonicRequest<{ albumInfo: AlbumInfo }>("/rest/getAlbumInfo2", { id });

export const getArtist = async (id: string) =>
  subsonicRequest<{ artist: ArtistWithAlbumsID3 }>(
    "/rest/getArtist",
    { id },
    {},
    { notFoundIsExpected: true },
  );

export const getArtistInfo = async (id: string) =>
  subsonicRequest<{ artistInfo: ArtistInfo }>("/rest/getArtistInfo", { id });

export const getArtistInfo2 = async (
  id: string,
  {
    count,
    includeNotPresent = false,
  }: { count?: number; includeNotPresent?: boolean },
) =>
  subsonicRequest<{ artistInfo2: ArtistInfo2 }>("/rest/getArtistInfo2", {
    id,
    count,
    includeNotPresent,
  });

export const getArtists = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
}) =>
  folderScopedRequest<{ artists: ArtistsID3 }>(
    "/rest/getArtists",
    { musicFolderId },
    { artists: { ignoredArticles: "", index: [] } },
  );

export const getGenres = async () =>
  subsonicRequest<{ genres: Genres }>("/rest/getGenres");

export const getIndexes = async ({
  musicFolderId,
  ifModifiedSince,
}: {
  musicFolderId?: string;
  ifModifiedSince?: number;
}) =>
  folderScopedRequest<{ indexes: Indexes }>(
    "/rest/getIndexes",
    { musicFolderId, ifModifiedSince },
    { indexes: { ignoredArticles: "", lastModified: 0, index: [] } },
  );

export const getMusicDirectory = async (id: string) =>
  subsonicRequest<{ directory: Directory }>("/rest/getMusicDirectory", { id });

export const getPodcastEpisode = async (id: string) =>
  subsonicRequest<{ podcastEpisode: PodcastEpisode }>(
    "/rest/getPodcastEpisode",
    { id },
  );

export const getSimilarSongs = async (
  id: string,
  { count }: { count?: number },
) =>
  subsonicRequest<{ similarSongs: SimilarSongs }>("/rest/getSimilarSongs", {
    id,
    count,
  });

export const getSimilarSongs2 = async (
  id: string,
  { count }: { count?: number },
) =>
  subsonicRequest<{ similarSongs2: SimilarSongs2 }>("/rest/getSimilarSongs2", {
    id,
    count,
  });

export const getSonicSimilarTracks = async (
  id: string,
  { count }: { count?: number },
) =>
  subsonicRequest<{ sonicSimilarTracks: SonicSimilarTracks }>(
    "/rest/getSonicSimilarTracks",
    { id, count },
  );

export const getSong = async (id: string) =>
  subsonicRequest<{ song: Child }>("/rest/getSong", { id });

// Subsonic has no batch existence endpoint, so probe one id at a time.
// `notFoundIsExpected` keeps a deleted track — the whole point of the probe —
// out of Sentry.
const SONGS_EXIST_CONCURRENCY = 4;

export const songsExist = async (ids: string[]): Promise<SongsExistResult> => {
  const verdicts = await mapWithConcurrency(
    ids,
    SONGS_EXIST_CONCURRENCY,
    async (id) => {
      try {
        await subsonicRequest<{ song: Child }>(
          "/rest/getSong",
          { id },
          {},
          { notFoundIsExpected: true },
        );
        return "present" as const;
      } catch (error) {
        // Only the server saying "no such data" proves deletion. A transport
        // failure or 5xx leaves the id unclassified.
        return isSubsonicDataNotFound(error)
          ? ("gone" as const)
          : ("unknown" as const);
      }
    },
  );
  return {
    present: ids.filter((_, i) => verdicts[i] === "present"),
    gone: ids.filter((_, i) => verdicts[i] === "gone"),
  };
};

export const getTopSongs = async (
  artist: string,
  { count }: { count?: number },
) =>
  subsonicRequest<{ topSongs: TopSongs }>("/rest/getTopSongs", {
    artist,
    count,
  });

export const getVideoInfo = async (id: string) =>
  subsonicRequest<{ videoInfo: VideoInfo }>("/rest/getVideoInfo", { id });

export const getVideos = async () =>
  subsonicRequest<{ videos: Videos }>("/rest/getVideos");

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
    // Raw call on purpose: a failed envelope just skips the own-albums filter
    // below instead of throwing like subsonicRequest would.
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
