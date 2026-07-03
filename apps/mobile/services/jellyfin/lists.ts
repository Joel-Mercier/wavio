import jellyfinApiInstance from "@/services/jellyfin/index";
import {
  mapBaseItemToAlbum,
  mapBaseItemToArtist,
  mapBaseItemToChild,
} from "@/services/jellyfin/mappers";
import type {
  BaseItemDto,
  JellyfinItemsResult,
} from "@/services/jellyfin/types";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type {
  AlbumList,
  AlbumList2,
  NowPlaying,
  Songs,
  Starred,
  Starred2,
} from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

const FIELDS =
  "DateCreated,Genres,GenreItems,UserData,ProductionYear,ChildCount,ProviderIds,MediaSources";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

function paramsFor(
  type: AlbumListType,
  {
    size = 20,
    offset = 0,
    fromYear,
    toYear,
    genre,
    musicFolderId,
  }: {
    size?: number;
    offset?: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string;
  },
) {
  const base: Record<string, string | number | boolean | undefined> = {
    UserId: userId(),
    Recursive: true,
    IncludeItemTypes: "MusicAlbum",
    Fields: FIELDS,
    Limit: size,
    StartIndex: offset,
    ParentId: musicFolderId,
  };
  switch (type) {
    case "random":
      return { ...base, SortBy: "Random" };
    case "newest":
      return { ...base, SortBy: "DateCreated", SortOrder: "Descending" };
    case "highest":
      return {
        ...base,
        SortBy: "CommunityRating,SortName",
        SortOrder: "Descending",
      };
    case "frequent":
      return {
        ...base,
        SortBy: "PlayCount",
        SortOrder: "Descending",
      };
    case "recent":
      return {
        ...base,
        SortBy: "DatePlayed",
        SortOrder: "Descending",
      };
    case "alphabeticalByName":
      return { ...base, SortBy: "SortName", SortOrder: "Ascending" };
    case "alphabeticalByArtist":
      return {
        ...base,
        SortBy: "AlbumArtist,SortName",
        SortOrder: "Ascending",
      };
    case "starred":
      return {
        ...base,
        Filters: "IsFavorite",
        SortBy: "SortName",
      };
    case "byYear":
      return {
        ...base,
        Years:
          fromYear != null && toYear != null
            ? Array.from(
                { length: Math.abs(toYear - fromYear) + 1 },
                (_, i) => Math.min(fromYear, toYear) + i,
              ).join(",")
            : undefined,
        SortBy: "ProductionYear,SortName",
      };
    case "byGenre":
      return { ...base, Genres: genre, SortBy: "SortName" };
    default:
      return base;
  }
}

export const getAlbumList = async (
  type: AlbumListType,
  opts: Parameters<typeof paramsFor>[1],
) => {
  const items = await fetchAlbums(type, opts);
  const list: AlbumList = {
    album: items.map((i) => ({
      ...mapBaseItemToChild(i),
      id: i.Id,
      title: i.Name ?? "",
      isDir: true,
    })),
  };
  return fakeEnvelope({ albumList: list });
};

async function fetchAlbums(
  type: AlbumListType,
  opts: Parameters<typeof paramsFor>[1],
): Promise<BaseItemDto[]> {
  // Jellyfin's home UI uses /Users/{UserId}/Items/Latest for "Latest Music".
  // The Latest endpoint groups Audio items by album, but Limit counts tracks
  // (pre-grouping) and StartIndex is unsupported — so we use it only for the
  // first page, then fall back to /Items?SortBy=DateCreated for pagination.
  if (type === "newest" && !opts.offset) {
    const size = opts.size ?? 20;
    const rsp = await jellyfinApiInstance.get<BaseItemDto[]>(
      `/Users/${userId()}/Items/Latest`,
      {
        params: {
          IncludeItemTypes: "Audio",
          // Limit counts tracks before album grouping; multiply so we get
          // approximately `size` albums back.
          Limit: size * 4,
          Fields: FIELDS,
          ParentId: opts.musicFolderId,
          ImageTypeLimit: 1,
          EnableImageTypes: "Primary,Backdrop,Banner,Thumb",
          EnableTotalRecordCount: false,
        },
      },
    );
    return (rsp.data ?? []).slice(0, size);
  }
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: paramsFor(type, opts),
  });
  return rsp.data?.Items ?? [];
}

export const getAlbumList2 = async (
  type: AlbumListType,
  opts: Parameters<typeof paramsFor>[1],
) => {
  const items = await fetchAlbums(type, opts);
  const list: AlbumList2 = {
    album: items.map(mapBaseItemToAlbum),
  };
  return fakeEnvelope({ albumList2: list });
};

export const getMostPlayedSongs = async ({
  size = 20,
  offset = 0,
  musicFolderId,
}: {
  size?: number;
  offset?: number;
  musicFolderId?: string;
} = {}) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: "Audio",
      Filters: "IsPlayed",
      SortBy: "PlayCount,SortName",
      SortOrder: "Descending",
      Limit: size,
      StartIndex: offset,
      Fields: FIELDS,
      ParentId: musicFolderId,
    },
  });
  const songs: Songs = {
    song: (rsp.data?.Items ?? []).map(mapBaseItemToChild),
  };
  return fakeEnvelope({ songs });
};

export const getNowPlaying = async () => {
  // Jellyfin exposes /Sessions but it requires admin and isn't analogous to
  // Subsonic NowPlaying. Return empty for parity.
  const np: NowPlaying = { entry: [] };
  return fakeEnvelope({ nowPlaying: np });
};

export const getRandomSongs = async ({
  size = 20,
  fromYear,
  toYear,
  genre,
  musicFolderId,
}: {
  size?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: string;
}) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: "Audio",
      SortBy: "Random",
      Limit: size,
      Fields: FIELDS,
      Genres: genre,
      ParentId: musicFolderId,
      Years:
        fromYear != null && toYear != null
          ? Array.from(
              { length: Math.abs(toYear - fromYear) + 1 },
              (_, i) => Math.min(fromYear, toYear) + i,
            ).join(",")
          : undefined,
    },
  });
  const songs: Songs = {
    song: (rsp.data?.Items ?? []).map(mapBaseItemToChild),
  };
  return fakeEnvelope({ songs });
};

export const getSongsByGenre = async (
  genre: string,
  {
    count = 20,
    offset = 0,
    musicFolderId,
  }: { count?: number; offset?: number; musicFolderId?: string },
) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: "Audio",
      Genres: genre,
      SortBy: "SortName",
      Limit: count,
      StartIndex: offset,
      Fields: FIELDS,
      ParentId: musicFolderId,
    },
  });
  const songs: Songs = {
    song: (rsp.data?.Items ?? []).map(mapBaseItemToChild),
  };
  return fakeEnvelope({ songs });
};

async function getFavorites(type: "MusicAlbum" | "Audio" | "MusicArtist") {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: type,
      Filters: "IsFavorite",
      Fields: FIELDS,
      SortBy: "SortName",
    },
  });
  return rsp.data?.Items ?? [];
}

export const getStarred = async (_params: { musicFolderId?: string }) => {
  const [albums, songs, artists] = await Promise.all([
    getFavorites("MusicAlbum"),
    getFavorites("Audio"),
    getFavorites("MusicArtist"),
  ]);
  const starred: Starred = {
    album: albums.map((i) => ({ ...mapBaseItemToChild(i), isDir: true })),
    song: songs.map(mapBaseItemToChild),
    artist: artists.map((i) => ({ id: i.Id, name: i.Name ?? "" })),
  };
  return fakeEnvelope({ starred });
};

export const getStarred2 = async (_params: { musicFolderId?: string }) => {
  const [albums, songs, artists] = await Promise.all([
    getFavorites("MusicAlbum"),
    getFavorites("Audio"),
    getFavorites("MusicArtist"),
  ]);
  const starred2: Starred2 = {
    album: albums.map(mapBaseItemToAlbum),
    song: songs.map(mapBaseItemToChild),
    artist: artists.map(mapBaseItemToArtist),
  };
  return fakeEnvelope({ starred2 });
};
