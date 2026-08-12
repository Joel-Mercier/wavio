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
import type { SongSortField, SongSortType } from "@/utils/songSort";
import { parseSortType } from "@/utils/sort";

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

// How many artist/album name matches a search resolves tracks for.
const SEARCH_HINTS = 5;
// How many tracks a search merges over, total. Every page merges this same
// window and slices it, so paging can't duplicate or skip rows — a per-page
// window can't: each branch's prefix grows at the *front* as the limit rises,
// so a later page's union is not a continuation of the earlier one. Matches
// beyond the window aren't reachable by scrolling, only by refining the query.
const SEARCH_WINDOW = 200;

const fetchAudio = async (
  params: Record<string, unknown>,
  musicFolderId?: string,
) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: "Audio",
      SortBy: "SortName",
      SortOrder: "Ascending",
      Fields: FIELDS,
      ParentId: musicFolderId,
      ...params,
    },
  });
  return rsp.data?.Items ?? [];
};

// `SearchTerm` matches item *names* only, so on Audio items it never sees the
// artist or the album — while the Subsonic counterpart folds onto search3,
// which matches all three. Resolve the name matches among artists and albums to
// ids and union their tracks in, so the same query finds the same songs on
// every backend.
//
// Artists live outside the library's item hierarchy (the same reason
// getMusicDirectory can't browse an artist by ParentId), so a Recursive /Items
// query scoped to a music folder never returns them. /Artists is the endpoint
// that does, and its ids are what the ArtistIds filter expects.
const searchArtistIds = async (query: string, musicFolderId?: string) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Artists", {
    params: {
      UserId: userId(),
      SearchTerm: query,
      Limit: SEARCH_HINTS,
      ParentId: musicFolderId,
    },
  });
  return (rsp.data?.Items ?? []).map((item) => item.Id).filter(Boolean);
};

// Albums are ordinary descendants, so they do come back from /Items.
const searchAlbumIds = async (query: string, musicFolderId?: string) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: "MusicAlbum",
      SearchTerm: query,
      Limit: SEARCH_HINTS,
      ParentId: musicFolderId,
    },
  });
  return (rsp.data?.Items ?? []).map((item) => item.Id).filter(Boolean);
};

const searchSongs = async (
  query: string,
  size: number,
  offset: number,
  musicFolderId?: string,
) => {
  const [byName, artistIds, albumIds] = await Promise.all([
    fetchAudio({ SearchTerm: query, Limit: SEARCH_WINDOW }, musicFolderId),
    searchArtistIds(query, musicFolderId),
    searchAlbumIds(query, musicFolderId),
  ]);
  const [byArtist, byAlbum] = await Promise.all([
    artistIds.length
      ? fetchAudio(
          { ArtistIds: artistIds.join(","), Limit: SEARCH_WINDOW },
          musicFolderId,
        )
      : [],
    albumIds.length
      ? fetchAudio(
          { AlbumIds: albumIds.join(","), Limit: SEARCH_WINDOW },
          musicFolderId,
        )
      : [],
  ]);
  const byId = new Map<string, BaseItemDto>();
  for (const item of [...byName, ...byArtist, ...byAlbum]) {
    byId.set(item.Id, item);
  }
  return [...byId.values()]
    .sort((a, b) => (a.Name ?? "").localeCompare(b.Name ?? ""))
    .slice(offset, offset + size);
};

// Secondary keys mirror the client-side track sort (utils/trackSort.ts), so an
// artist or album sort keeps each album's songs in playing order.
const SONG_SORT_BY: Partial<Record<SongSortField, string>> = {
  addedAt: "DateCreated",
  alphabetical: "SortName",
  artist: "Artist,Album,ParentIndexNumber,IndexNumber",
  albumArtist: "AlbumArtist,Album,ParentIndexNumber,IndexNumber",
  album: "Album,ParentIndexNumber,IndexNumber",
  year: "ProductionYear,SortName",
  duration: "Runtime",
  playCount: "PlayCount",
};

// Whole-library track browse, and a search over it (see the Subsonic
// counterpart, which folds both onto search3).
// A `sort` overrides fetchAudio's SortName/Ascending default. It is ignored
// while searching: that path merges three requests into one client-side window,
// so the order there is the merge's, not the server's.
export const getSongs = async ({
  query,
  size = 50,
  offset = 0,
  sort,
  musicFolderId,
}: {
  query?: string;
  size?: number;
  offset?: number;
  sort?: SongSortType;
  musicFolderId?: string;
} = {}) => {
  const { field, direction } = parseSortType(sort ?? "defaultAsc");
  const sortBy = SONG_SORT_BY[field];
  const items = query
    ? await searchSongs(query, size, offset, musicFolderId)
    : await fetchAudio(
        {
          Limit: size,
          StartIndex: offset,
          ...(sortBy && {
            SortBy: sortBy,
            SortOrder: direction === "desc" ? "Descending" : "Ascending",
          }),
        },
        musicFolderId,
      );
  const songs: Songs = { song: items.map(mapBaseItemToChild) };
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

// Jellyfin has no server-side filter for *favourited artists*. /Items never
// returns artists at all (see searchItems in searching.ts), and on /Artists both
// `IsFavorite=true` and `Filters=IsFavorite` match artists that merely *have* a
// favourite album or song — verified on 10.11.11, where they return an artist
// whose own UserData.IsFavorite is false, while `IsFavorite=false` returns
// nothing. So list the artists and keep the ones actually flagged.
async function getFavoriteArtists() {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Artists", {
    params: {
      UserId: userId(),
      Recursive: true,
      Fields: FIELDS,
      SortBy: "SortName",
    },
  });
  return (rsp.data?.Items ?? []).filter((item) => item.UserData?.IsFavorite);
}

async function getFavorites(type: "MusicAlbum" | "Audio" | "MusicArtist") {
  if (type === "MusicArtist") return getFavoriteArtists();
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
