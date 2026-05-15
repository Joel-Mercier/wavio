import jellyfinApiInstance from "@/services/jellyfin/index";
import {
  mapBaseItemToAlbum,
  mapBaseItemToArtist,
  mapBaseItemToChild,
} from "@/services/jellyfin/mappers";
import type { JellyfinItemsResult } from "@/services/jellyfin/types";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type {
  SearchResult,
  SearchResult2,
  SearchResult3,
} from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

const FIELDS =
  "DateCreated,Genres,GenreItems,UserData,ProductionYear,ChildCount,ProviderIds";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

async function searchItems(
  type: "MusicAlbum" | "MusicArtist" | "Audio",
  searchTerm: string,
  limit?: number,
  startIndex?: number,
) {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: type,
      SearchTerm: searchTerm,
      Limit: limit ?? 20,
      StartIndex: startIndex ?? 0,
      Fields: FIELDS,
    },
  });
  return rsp.data?.Items ?? [];
}

export const search = async (_opts: {
  artist?: string;
  album?: string;
  title?: string;
  any?: string;
  count?: number;
  offset?: number;
  newerThan?: number;
}) => {
  const result: SearchResult = { offset: 0, totalHits: 0, match: [] };
  return fakeEnvelope({ searchResult: result });
};

export const search2 = async (
  query: string,
  opts: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
  },
) => {
  const [albums, artists, songs] = await Promise.all([
    searchItems("MusicAlbum", query, opts.albumCount, opts.albumOffset),
    searchItems("MusicArtist", query, opts.artistCount, opts.artistOffset),
    searchItems("Audio", query, opts.songCount, opts.songOffset),
  ]);
  const result: SearchResult2 = {
    album: albums.map((i) => ({ ...mapBaseItemToChild(i), isDir: true })),
    artist: artists.map((i) => ({ id: i.Id, name: i.Name ?? "" })),
    song: songs.map(mapBaseItemToChild),
  };
  return fakeEnvelope({ searchResult2: result });
};

export const search3 = async (
  query: string,
  opts: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
  },
) => {
  const [albums, artists, songs] = await Promise.all([
    searchItems("MusicAlbum", query, opts.albumCount, opts.albumOffset),
    searchItems("MusicArtist", query, opts.artistCount, opts.artistOffset),
    searchItems("Audio", query, opts.songCount, opts.songOffset),
  ]);
  const result: SearchResult3 = {
    album: albums.map(mapBaseItemToAlbum),
    artist: artists.map(mapBaseItemToArtist),
    song: songs.map(mapBaseItemToChild),
  };
  return fakeEnvelope({ searchResult3: result });
};
