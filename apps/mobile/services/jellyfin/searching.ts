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
  "DateCreated,Genres,GenreItems,UserData,ProductionYear,ChildCount,ProviderIds,MediaSources";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

async function searchItems(
  type: "MusicAlbum" | "MusicArtist" | "Audio",
  searchTerm: string,
  limit?: number,
  startIndex?: number,
) {
  // Artists live outside the library's item hierarchy — the same reason
  // getMusicDirectory can't browse an artist by ParentId — so /Items never
  // returns them whatever the filters (verified against 10.11.11: every
  // MusicArtist query comes back empty, which left artists out of every search
  // result). /Artists lists them, and honours Limit/StartIndex the same way.
  const isArtist = type === "MusicArtist";
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>(
    isArtist ? "/Artists" : "/Items",
    {
      params: {
        UserId: userId(),
        Recursive: true,
        ...(isArtist ? {} : { IncludeItemTypes: type }),
        SearchTerm: searchTerm,
        Limit: limit ?? 20,
        StartIndex: startIndex ?? 0,
        Fields: FIELDS,
      },
    },
  );
  return rsp.data?.Items ?? [];
}

// Subsonic expresses "don't search this kind" as a count of 0, and callers that
// want songs only (the library sync crawl, the ListenBrainz resolver) pass it for
// the other two. Honouring it turns a 50-track resolve from 150 requests into 50.
// `undefined` still means "server default", so existing callers are unaffected.
async function searchItemsOrSkip(
  type: "MusicAlbum" | "MusicArtist" | "Audio",
  searchTerm: string,
  limit?: number,
  startIndex?: number,
) {
  if (limit === 0) return [];
  return searchItems(type, searchTerm, limit, startIndex);
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
    searchItemsOrSkip("MusicAlbum", query, opts.albumCount, opts.albumOffset),
    searchItemsOrSkip(
      "MusicArtist",
      query,
      opts.artistCount,
      opts.artistOffset,
    ),
    searchItemsOrSkip("Audio", query, opts.songCount, opts.songOffset),
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
    searchItemsOrSkip("MusicAlbum", query, opts.albumCount, opts.albumOffset),
    searchItemsOrSkip(
      "MusicArtist",
      query,
      opts.artistCount,
      opts.artistOffset,
    ),
    searchItemsOrSkip("Audio", query, opts.songCount, opts.songOffset),
  ]);
  const result: SearchResult3 = {
    album: albums.map(mapBaseItemToAlbum),
    artist: artists.map(mapBaseItemToArtist),
    song: songs.map(mapBaseItemToChild),
  };
  return fakeEnvelope({ searchResult3: result });
};
