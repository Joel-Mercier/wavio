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
  TopSongs,
} from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

const COMMON_FIELDS =
  "DateCreated,Genres,GenreItems,Path,MediaSources,UserData,ProviderIds,ParentId,AlbumPrimaryImageTag,ChildCount,ProductionYear";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

async function fetchItems(
  params: Record<string, string | number | boolean | undefined>,
): Promise<JellyfinItemsResult> {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      Fields: COMMON_FIELDS,
      ...params,
    },
  });
  return rsp.data;
}

export const getMusicFolders = async () => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>(
    "/Library/MediaFolders",
  );
  const music = (rsp.data?.Items ?? []).filter(
    (i) => i.Type === "CollectionFolder" || i.CollectionType === "music",
  ) as (BaseItemDto & { CollectionType?: string })[];
  const list: MusicFolders = {
    musicFolder: music.map((m, i) => mapMusicFolder(m, i + 1)),
  };
  return fakeEnvelope({ musicFolders: list });
};

export const getAlbum = async (id: string) => {
  const tracks = await fetchItems({
    ParentId: id,
    IncludeItemTypes: "Audio",
    SortBy: "ParentIndexNumber,IndexNumber,SortName",
  });
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
  const albums = await fetchItems({
    ArtistIds: id,
    IncludeItemTypes: "MusicAlbum",
    SortBy: "PremiereDate,ProductionYear,SortName",
    SortOrder: "Descending",
  });
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
  // Group by first letter
  const buckets = new Map<string, BaseItemDto[]>();
  for (const item of rsp.data?.Items ?? []) {
    const letter = (item.Name?.[0] ?? "#").toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : "#";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)?.push(item);
  }
  const artists: ArtistsID3 = {
    ignoredArticles: "",
    index: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({
        name,
        artist: items.map(mapBaseItemToArtist),
      })),
  };
  return fakeEnvelope({ artists });
};

export const getGenres = async () => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>(
    "/MusicGenres",
    {
      params: {
        UserId: userId(),
        Fields: "ChildCount",
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
  const tracks = await fetchItems({ ParentId: id });
  return fakeEnvelope({
    directory: {
      id,
      name: "",
      child: tracks.Items?.map(mapBaseItemToChild),
    },
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
