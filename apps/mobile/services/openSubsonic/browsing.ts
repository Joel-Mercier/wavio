import openSubsonicApiInstance, {
  folderScopedRequest,
  isSubsonicDataNotFound,
  type OpenSubsonicResponse,
  okEnvelope,
  subsonicRequest,
} from "@/services/openSubsonic/index";
import { search3 } from "@/services/openSubsonic/searching";
import type {
  AlbumID3,
  AlbumInfo,
  AlbumWithSongsID3,
  ArtistID3,
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
  SonicMatch,
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

// Similar songs are optional decoration (they seed endless playback), so a
// server with nothing similar for a track answers code 70 "data not found" —
// a data state, like an empty folder browse.
export const getSimilarSongs = async (
  id: string,
  { count }: { count?: number },
) =>
  subsonicRequest<{ similarSongs: SimilarSongs }>(
    "/rest/getSimilarSongs",
    { id, count },
    {},
    { notFoundIsExpected: true },
  );

export const getSimilarSongs2 = async (
  id: string,
  { count }: { count?: number },
) =>
  subsonicRequest<{ similarSongs2: SimilarSongs2 }>(
    "/rest/getSimilarSongs2",
    { id, count },
    {},
    { notFoundIsExpected: true },
  );

// The matches come back as a top-level `sonicMatch` array, not under the
// `sonicSimilarTracks` wrapper the name suggests, so they are lifted into the
// wrapper Jellyfin already produces. Reading the wrapper straight off the
// envelope compiled fine and always yielded undefined, which made the
// sonicSimilarity extension silently fall through to getSimilarSongs2 (see
// services/similarSongs.ts) — the same defect as getRandomSongs (#169).
export const getSonicSimilarTracks = async (
  id: string,
  { count }: { count?: number },
) => {
  const rsp = await subsonicRequest<{ sonicMatch?: SonicMatch[] }>(
    "/rest/getSonicSimilarTracks",
    { id, count },
    {},
    { notFoundIsExpected: true },
  );
  return okEnvelope<{ sonicSimilarTracks: SonicSimilarTracks }>({
    sonicSimilarTracks: { sonicMatch: rsp.sonicMatch ?? [] },
  });
};

export const getSong = async (id: string) =>
  subsonicRequest<{ song: Child }>("/rest/getSong", { id });

// Subsonic has no batch existence endpoint, so probe one id at a time.
// `notFoundIsExpected` keeps a deleted track — the whole point of the probe —
// out of Sentry.
const SONGS_EXIST_CONCURRENCY = 4;

// Neither is there a batch fetch, so hydrating a list of ids costs one request
// each. Ids the server no longer knows are dropped rather than failing the whole
// set: the caller's id list comes from an external index (AudioMuse-AI) that can
// lag a library change.
export const getSongsByIds = async (ids: string[]): Promise<Child[]> => {
  if (ids.length === 0) return [];
  const songs = await mapWithConcurrency(
    ids,
    SONGS_EXIST_CONCURRENCY,
    async (id) => {
      try {
        const rsp = await subsonicRequest<{ song: Child }>(
          "/rest/getSong",
          { id },
          {},
          { notFoundIsExpected: true },
        );
        return rsp.song;
      } catch {
        return null;
      }
    },
  );
  return songs.filter((song) => !!song);
};

// Same story for artists, minus even the option of a batch: /rest/getArtist is
// the only lookup, and it answers with the artist's whole discography when all
// the caller wants is the name and cover. Callers that already hold the artist
// index should match against that instead of paying this.
export const getArtistsByIds = async (ids: string[]): Promise<ArtistID3[]> => {
  if (ids.length === 0) return [];
  const artists = await mapWithConcurrency(
    ids,
    SONGS_EXIST_CONCURRENCY,
    async (id) => {
      try {
        const rsp = await getArtist(id);
        return rsp.artist ?? null;
      } catch {
        return null;
      }
    },
  );
  return artists.filter((artist) => !!artist).map(stripArtistAlbums);
};

// getArtist answers ArtistWithAlbumsID3; the album list is dead weight in a
// carousel and would bloat the persisted query cache, so drop it.
function stripArtistAlbums({
  album: _album,
  ...artist
}: ArtistWithAlbumsID3): ArtistID3 {
  return artist;
}

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

// `id` is the `topSongsByArtistId` extension: servers advertising it resolve the
// artist from the id and treat `artist` as optional, servers without it ignore
// `id` and need the name. Sending an empty `artist` would be a valid-but-
// unmatchable name on the latter, so omit it rather than send a blank.
export const getTopSongs = async (
  artist: string,
  { count, id }: { count?: number; id?: string } = {},
) =>
  subsonicRequest<{ topSongs: TopSongs }>("/rest/getTopSongs", {
    artist: artist || undefined,
    count,
    id,
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

const ARTIST_SONGS_CONCURRENCY = 4;

// Subsonic has no "songs by artist" endpoint — search3 on the artist name would
// both miss tracks and cap out — so the discography is the index: getArtist
// lists the albums and each getAlbum answers with its tracklist. Songs come back
// in album order, then disc/track within an album. An album that fails to load
// is skipped rather than sinking the whole list.
export const getArtistSongs = async (id: string) => {
  const artistRsp = await getArtist(id);
  const albums = artistRsp.artist?.album ?? [];
  const albumSongs = await mapWithConcurrency(
    albums,
    ARTIST_SONGS_CONCURRENCY,
    async (album) => {
      try {
        const rsp = await getAlbum(album.id);
        return rsp.album?.song ?? [];
      } catch {
        return [];
      }
    },
  );
  const song: Child[] = albumSongs.flat();
  return { artistSongs: { song }, status: "ok" as const };
};
