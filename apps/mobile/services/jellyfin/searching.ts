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
import {
  alphanumericRuns,
  matchesAllTokens,
  normalizeSearchText,
} from "@/services/searchText";
import { useAuthBase } from "@/stores/auth";

const FIELDS =
  "DateCreated,Genres,GenreItems,UserData,ProductionYear,ChildCount,ProviderIds,MediaSources";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

type SearchType = "MusicAlbum" | "MusicArtist" | "Audio";

async function requestItems(
  type: SearchType,
  searchTerm: string,
  limit: number,
  startIndex: number,
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
        Limit: limit,
        StartIndex: startIndex,
        Fields: FIELDS,
      },
    },
  );
  return rsp.data?.Items ?? [];
}

const FALLBACK_MIN_LIMIT = 100;

async function searchItems(
  type: SearchType,
  searchTerm: string,
  limit = 20,
  startIndex = 0,
) {
  const items = await requestItems(type, searchTerm, limit, startIndex);
  if (items.length > 0 || startIndex > 0) return items;

  // Up to 10.11 `SearchTerm` is a plain substring match on `CleanName`, which
  // is only casefolded and de-accented, so "tyler the creator" never finds
  // "Tyler, the Creator" (12.0 strips punctuation on both sides — PR #14879 —
  // and this branch simply never fires there because the first request hits).
  // Normalising our query can't help while the server's data keeps its
  // punctuation, so retry with the longest alphanumeric run — a safe substring
  // of the punctuated name — and apply the punctuation-blind match ourselves.
  // Gated on an empty first page so server ranking and pagination stay in
  // charge whenever the plain query works; a type with both a plain hit and a
  // punctuated miss shows only the former, which beats doubling every request.
  const runs = alphanumericRuns(searchTerm);
  if (runs.length < 2) return items;
  const probe = normalizeSearchText(runs[0]);
  if (probe.length < 2) return items;
  const candidates = await requestItems(
    type,
    probe,
    Math.max(limit * 5, FALLBACK_MIN_LIMIT),
    0,
  );
  return candidates
    .filter((item) => matchesAllTokens(item.Name ?? "", searchTerm))
    .slice(0, limit);
}

// Subsonic expresses "don't search this kind" as a count of 0, and callers that
// want songs only (the library sync crawl, the ListenBrainz resolver) pass it for
// the other two. Honouring it turns a 50-track resolve from 150 requests into 50.
// `undefined` still means "server default", so existing callers are unaffected.
async function searchItemsOrSkip(
  type: SearchType,
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
