import jellyfinApiInstance, {
  MUSIC_ARTIST_ITEM_TYPES,
} from "@/services/jellyfin/index";
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
import { gte, parseServerVersion, type SemVer } from "@/utils/navidromeVersion";

const FIELDS =
  "DateCreated,Genres,GenreItems,UserData,ProductionYear,ChildCount,ProviderIds,MediaSources";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

type SearchType = "MusicAlbum" | "MusicArtist" | "Audio";

type SearchOptions = {
  artistCount?: number;
  artistOffset?: number;
  albumCount?: number;
  albumOffset?: number;
  songCount?: number;
  songOffset?: number;
  signal?: AbortSignal;
};

type Section = { type: SearchType; limit: number; startIndex: number };

async function requestItems(
  type: SearchType,
  searchTerm: string,
  limit: number,
  startIndex: number,
  signal: AbortSignal | undefined,
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
        IncludeItemTypes: isArtist ? MUSIC_ARTIST_ITEM_TYPES : type,
        SearchTerm: searchTerm,
        Limit: limit,
        StartIndex: startIndex,
        Fields: FIELDS,
        // Nothing reads the total, and counting it roughly doubles what the
        // server spends on a search (issue #272).
        EnableTotalRecordCount: false,
      },
      signal,
    },
  );
  return rsp.data?.Items ?? [];
}

const DEFAULT_LIMIT = 20;
const FALLBACK_MIN_LIMIT = 100;

const PUNCTUATION_BLIND_SEARCH_VERSION: SemVer = [12, 0, 0];

// Up to 10.11 `SearchTerm` is a plain substring match on `CleanName`, which is
// only casefolded and de-accented, so "tyler the creator" never finds "Tyler,
// the Creator". 12.0 strips punctuation on both sides (PR #14879), so the
// fallback below is only for older servers; an unknown version counts as old.
function serverSearchKeepsPunctuation(): boolean {
  return !gte(
    parseServerVersion(useAuthBase.getState().serverVersion),
    PUNCTUATION_BLIND_SEARCH_VERSION,
  );
}

// Normalising our query can't help while the server's data keeps its
// punctuation, so retry with the longest alphanumeric run (a safe substring of
// the punctuated name) and apply the punctuation-blind match ourselves.
async function punctuationFallback(
  section: Section,
  searchTerm: string,
  probe: string,
  signal: AbortSignal | undefined,
) {
  const candidates = await requestItems(
    section.type,
    probe,
    Math.max(section.limit * 5, FALLBACK_MIN_LIMIT),
    0,
    signal,
  );
  return candidates
    .filter((item) => matchesAllTokens(item.Name ?? "", searchTerm))
    .slice(0, section.limit);
}

function toSection(
  type: SearchType,
  limit = DEFAULT_LIMIT,
  startIndex = 0,
): Section {
  return { type, limit, startIndex };
}

function fallbackProbe(searchTerm: string): string | null {
  const runs = alphanumericRuns(searchTerm);
  if (runs.length < 2) return null;
  const probe = normalizeSearchText(runs[0]);
  return probe.length < 2 ? null : probe;
}

// Subsonic expresses "don't search this kind" as a count of 0, and callers that
// want songs only (the library sync crawl, the ListenBrainz resolver) pass it for
// the other two. Honouring it turns a 50-track resolve from 150 requests into 50.
// `undefined` still means the default page of 20, so existing callers are
// unaffected.
//
// The punctuation fallback is a second, serial round with a broad probe, so it
// only runs when the whole first page found nothing. Retrying each empty section
// made nearly every multi-word query pay for it, since a song title never
// matches an artist name (issue #272).
async function searchSections(searchTerm: string, opts: SearchOptions) {
  const sections = [
    toSection("MusicAlbum", opts.albumCount, opts.albumOffset),
    toSection("MusicArtist", opts.artistCount, opts.artistOffset),
    toSection("Audio", opts.songCount, opts.songOffset),
  ];
  const results = await Promise.all(
    sections.map((section) =>
      section.limit === 0
        ? []
        : requestItems(
            section.type,
            searchTerm,
            section.limit,
            section.startIndex,
            opts.signal,
          ),
    ),
  );

  const retry = sections.filter(
    (section) => section.limit !== 0 && section.startIndex === 0,
  );
  if (retry.length === 0 || results.some((items) => items.length > 0)) {
    return results;
  }
  if (!serverSearchKeepsPunctuation()) return results;
  const probe = fallbackProbe(searchTerm);
  if (!probe) return results;

  return Promise.all(
    sections.map((section, i) =>
      retry.includes(section)
        ? punctuationFallback(section, searchTerm, probe, opts.signal)
        : results[i],
    ),
  );
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

export const search2 = async (query: string, opts: SearchOptions) => {
  const [albums, artists, songs] = await searchSections(query, opts);
  const result: SearchResult2 = {
    album: albums.map((i) => ({ ...mapBaseItemToChild(i), isDir: true })),
    artist: artists.map((i) => ({ id: i.Id, name: i.Name ?? "" })),
    song: songs.map(mapBaseItemToChild),
  };
  return fakeEnvelope({ searchResult2: result });
};

export const search3 = async (query: string, opts: SearchOptions) => {
  const [albums, artists, songs] = await searchSections(query, opts);
  const result: SearchResult3 = {
    album: albums.map(mapBaseItemToAlbum),
    artist: artists.map(mapBaseItemToArtist),
    song: songs.map(mapBaseItemToChild),
  };
  return fakeEnvelope({ searchResult3: result });
};
