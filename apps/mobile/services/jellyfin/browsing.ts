import axios, { type AxiosRequestConfig } from "axios";
import jellyfinApiInstance from "@/services/jellyfin/index";
import {
  mapBaseItemToAlbum,
  mapBaseItemToAlbumWithSongs,
  mapBaseItemToArtist,
  mapBaseItemToArtistWithAlbums,
  mapBaseItemToChild,
  mapJellyfinGenre,
  mapMusicFolder,
} from "@/services/jellyfin/mappers";
import type {
  BaseItemDto,
  JellyfinItemsResult,
} from "@/services/jellyfin/types";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type {
  AlbumID3,
  AlbumInfo,
  AlbumWithSongsID3,
  ArtistInfo,
  ArtistInfo2,
  ArtistsID3,
  ArtistWithAlbumsID3,
  Child,
  Genres,
  Indexes,
  MusicFolders,
  SimilarSongs,
  SimilarSongs2,
  SonicSimilarTracks,
  TopSongs,
} from "@/services/openSubsonic/types";
import { buildArtistIndex } from "@/services/pinyinIndex";
import { useAuthBase } from "@/stores/auth";

const COMMON_FIELDS =
  "DateCreated,Genres,GenreItems,Path,MediaSources,UserData,ProviderIds,ParentId,AlbumPrimaryImageTag,ChildCount,ProductionYear";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

async function fetchItems(
  params: Record<string, string | number | boolean | undefined>,
  // Set for an id-scoped child browse (album/artist/directory contents): a
  // stale/invalid parent id then resolves to an empty result instead of an
  // error (Jellyfin answers 400 or 404), mirroring the Subsonic code-70
  // folderScopedRequest handling. Don't set it for top-level list/search calls,
  // where a 400 is a real request bug.
  opts: { notFoundIsExpected?: boolean } = {},
): Promise<JellyfinItemsResult> {
  try {
    const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
      params: {
        UserId: userId(),
        Recursive: true,
        Fields: COMMON_FIELDS,
        ...params,
      },
      // Read by the response interceptor to skip reporting the expected 400/404.
      notFoundIsExpected: opts.notFoundIsExpected,
    } as AxiosRequestConfig & { notFoundIsExpected?: boolean });
    return rsp.data;
  } catch (error) {
    if (
      opts.notFoundIsExpected &&
      axios.isAxiosError(error) &&
      (error.response?.status === 400 || error.response?.status === 404)
    ) {
      return { Items: [] };
    }
    throw error;
  }
}

export const getMusicFolders = async () => {
  // `/Library/MediaFolders` requires admin elevation (403 for normal users);
  // `/UserViews` returns the libraries the current user can actually access.
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/UserViews", {
    params: { UserId: userId() },
  });
  const music = (rsp.data?.Items ?? []).filter(
    (i) => (i as { CollectionType?: string }).CollectionType === "music",
  ) as (BaseItemDto & { CollectionType?: string })[];
  const list: MusicFolders = {
    musicFolder: music.map((m, i) => mapMusicFolder(m, i + 1)),
  };
  return fakeEnvelope({ musicFolders: list });
};

export const getAlbum = async (id: string) => {
  const tracks = await fetchItems(
    {
      ParentId: id,
      IncludeItemTypes: "Audio",
      SortBy: "ParentIndexNumber,IndexNumber,SortName",
    },
    { notFoundIsExpected: true },
  );
  const albumRsp = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const album: AlbumWithSongsID3 = mapBaseItemToAlbumWithSongs(
    albumRsp.data,
    tracks.Items ?? [],
  );
  return fakeEnvelope({ album });
};

export const getAlbumInfo = async (id: string) => {
  const item = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const info: AlbumInfo = { notes: item.data?.Overview };
  return fakeEnvelope({ albumInfo: info });
};

export const getAlbumInfo2 = getAlbumInfo;

export const getArtist = async (id: string) => {
  const albums = await fetchItems(
    {
      ArtistIds: id,
      IncludeItemTypes: "MusicAlbum",
      SortBy: "PremiereDate,ProductionYear,SortName",
      SortOrder: "Descending",
    },
    { notFoundIsExpected: true },
  );
  const artistRsp = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const artist: ArtistWithAlbumsID3 = mapBaseItemToArtistWithAlbums(
    artistRsp.data,
    albums.Items ?? [],
  );
  return fakeEnvelope({ artist });
};

export const getArtistAppearances = async (
  id: string,
  _opts: { name?: string; musicFolderId?: string } = {},
) => {
  const rsp = await fetchItems(
    {
      IncludeItemTypes: "MusicAlbum",
      ContributingArtistIds: id,
      ExcludeItemIds: id,
      SortBy: "PremiereDate,ProductionYear,SortName",
      SortOrder: "Descending",
    },
    { notFoundIsExpected: true },
  );
  const album: AlbumID3[] = (rsp.Items ?? []).map(mapBaseItemToAlbum);
  return fakeEnvelope({ artistAppearances: { album } });
};

export const getArtistInfo = async (id: string) => {
  const item = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const info: ArtistInfo = { biography: item.data?.Overview };
  return fakeEnvelope({ artistInfo: info });
};

export const getArtistInfo2 = async (
  id: string,
  _opts: { count?: number; includeNotPresent?: boolean },
) => {
  const item = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const info: ArtistInfo2 = { biography: item.data?.Overview };
  return fakeEnvelope({ artistInfo2: info });
};

export const getArtists = async ({
  musicFolderId: _musicFolderId,
}: {
  musicFolderId?: string;
}) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>(
    "/Artists/AlbumArtists",
    {
      params: {
        UserId: userId(),
        Recursive: true,
        Fields: COMMON_FIELDS,
        SortBy: "SortName",
      },
    },
  );
  const artists: ArtistsID3 = {
    ignoredArticles: "",
    index: buildArtistIndex((rsp.data?.Items ?? []).map(mapBaseItemToArtist)),
  };
  return fakeEnvelope({ artists });
};

export const getGenres = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
} = {}) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>(
    "/MusicGenres",
    {
      params: {
        UserId: userId(),
        Fields: "ChildCount",
        ParentId: musicFolderId,
      },
    },
  );
  const genres: Genres = {
    genre: (rsp.data?.Items ?? []).map(mapJellyfinGenre),
  };
  return fakeEnvelope({ genres });
};

export const getIndexes = async ({
  musicFolderId,
}: {
  musicFolderId?: string;
  ifModifiedSince?: number;
}) => {
  const artistsRsp = await getArtists({ musicFolderId });
  const indexes: Indexes = {
    ignoredArticles: "",
    lastModified: Date.now(),
    index: artistsRsp.artists?.index?.map((idx) => ({
      name: idx.name,
      // Index in v1 uses Artist (without ID3), but we can keep ArtistID3 shape
      // — UI consumers tolerate the extra fields.
      artist: idx.artist?.map((a) => ({ id: a.id, name: a.name })) ?? [],
    })),
  };
  return fakeEnvelope({ indexes });
};

export const getMusicDirectory = async (id: string) => {
  // Keep the browse hierarchy (artist -> albums -> tracks) navigable. Artists
  // aren't the filesystem parent of their albums in Jellyfin, so ParentId
  // browsing returns nothing for them — fetch albums by ArtistIds instead.
  // Albums and physical folders do parent their children, so ParentId works.
  const itemRsp = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const items =
    itemRsp.data?.Type === "MusicArtist"
      ? (
          await fetchItems(
            {
              ArtistIds: id,
              IncludeItemTypes: "MusicAlbum",
              SortBy: "PremiereDate,ProductionYear,SortName",
              SortOrder: "Descending",
            },
            { notFoundIsExpected: true },
          )
        ).Items
      : (
          await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
            params: { UserId: userId(), ParentId: id, Fields: COMMON_FIELDS },
          })
        ).data?.Items;
  const child: Child[] = (items ?? []).map((item) => {
    const mapped = mapBaseItemToChild(item);
    return item.IsFolder
      ? { ...mapped, isDir: true, title: item.Name ?? mapped.title }
      : mapped;
  });
  return fakeEnvelope({
    directory: { id, name: itemRsp.data?.Name ?? "", child },
  });
};

export const getPodcastEpisode = async (_id: string) => {
  return fakeEnvelope({ podcastEpisode: undefined });
};

export const getSimilarSongs = async (
  id: string,
  { count }: { count?: number },
) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>(
    `/Items/${id}/Similar`,
    {
      params: {
        UserId: userId(),
        Fields: COMMON_FIELDS,
        Limit: count ?? 20,
      },
    },
  );
  const similar: SimilarSongs = {
    song: (rsp.data?.Items ?? []).map(mapBaseItemToChild),
  };
  return fakeEnvelope({ similarSongs: similar });
};

export const getSimilarSongs2 = async (
  id: string,
  opts: { count?: number },
) => {
  const inner = await getSimilarSongs(id, opts);
  const sim2: SimilarSongs2 = { song: inner.similarSongs.song };
  return fakeEnvelope({ similarSongs2: sim2 });
};

type AudioMuseSimilarTrack = {
  item_id: string;
  title?: string;
  author?: string;
  distance?: number;
};

// Audio-similarity matches from the AudioMuse-AI plugin's /AudioMuseAI endpoint.
// Reached only when the active Jellyfin server advertises the synthesized
// `sonicSimilarity` extension (see services/jellyfin/system.ts), so this is a
// no-op cost on plugin-less servers. AudioMuse returns just id/title/artist/
// distance, ranked nearest-first, so we hydrate the full BaseItems to build
// proper Child entries (artwork, duration, album) and preserve that ranking.
export const getSonicSimilarTracks = async (
  id: string,
  { count }: { count?: number },
) => {
  const rsp = await jellyfinApiInstance.get<AudioMuseSimilarTrack[]>(
    "/AudioMuseAI/similar_tracks",
    { params: { item_id: id, n: count ?? 20 } },
  );
  const ids = (rsp.data ?? []).map((t) => t.item_id).filter(Boolean);
  if (ids.length === 0) {
    const sonicSimilarTracks: SonicSimilarTracks = { sonicMatch: [] };
    return fakeEnvelope({ sonicSimilarTracks });
  }
  const items = await fetchItems({ Ids: ids.join(",") });
  const byId = new Map((items.Items ?? []).map((item) => [item.Id, item]));
  const sonicMatch = ids
    .map((tid) => byId.get(tid))
    .filter((item): item is BaseItemDto => !!item)
    .map((item) => ({ entry: mapBaseItemToChild(item) }));
  const sonicSimilarTracks: SonicSimilarTracks = { sonicMatch };
  return fakeEnvelope({ sonicSimilarTracks });
};

export const getSong = async (id: string) => {
  const rsp = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
    { params: { Fields: COMMON_FIELDS } },
  );
  const song: Child = mapBaseItemToChild(rsp.data);
  return fakeEnvelope({ song });
};

export const getTopSongs = async (
  artist: string,
  { count }: { count?: number },
) => {
  // Jellyfin doesn't expose top songs per name; fetch by artist match and
  // sort by PlayCount as a best-effort substitute.
  const rsp = await fetchItems({
    IncludeItemTypes: "Audio",
    SearchTerm: artist,
    SortBy: "PlayCount,SortName",
    SortOrder: "Descending",
    Limit: count ?? 50,
  });
  const top: TopSongs = {
    song: (rsp.Items ?? []).map(mapBaseItemToChild),
  };
  return fakeEnvelope({ topSongs: top });
};

export const getVideoInfo = async (_id: string) => {
  return fakeEnvelope({ videoInfo: { id: _id } });
};

export const getVideos = async () => {
  return fakeEnvelope({ videos: { video: [] } });
};
