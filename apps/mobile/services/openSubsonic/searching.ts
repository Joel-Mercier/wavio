import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  SearchResult,
  SearchResult2,
  SearchResult3,
} from "@/services/openSubsonic/types";

export const search = async ({
  artist,
  album,
  title,
  any,
  count,
  offset,
  newerThan,
}: {
  artist?: string;
  album?: string;
  title?: string;
  any?: string;
  count?: number;
  offset?: number;
  newerThan?: number;
}) =>
  subsonicRequest<{ searchResult: SearchResult }>("/rest/search", {
    artist,
    album,
    title,
    any,
    count,
    offset,
    newerThan,
  });

export const search2 = async (
  query: string,
  {
    artistCount,
    artistOffset,
    albumCount,
    albumOffset,
    songCount,
    songOffset,
    musicFolderId,
  }: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
    musicFolderId?: string;
  },
) =>
  subsonicRequest<{ searchResult2: SearchResult2 }>("/rest/search2", {
    query,
    artistCount,
    artistOffset,
    albumCount,
    albumOffset,
    songCount,
    songOffset,
    musicFolderId,
  });

export const search3 = async (
  query: string,
  {
    artistCount,
    artistOffset,
    albumCount,
    albumOffset,
    songCount,
    songOffset,
    musicFolderId,
  }: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
    musicFolderId?: string;
  },
) =>
  subsonicRequest<{ searchResult3: SearchResult3 }>("/rest/search3", {
    query,
    artistCount,
    artistOffset,
    albumCount,
    albumOffset,
    songCount,
    songOffset,
    musicFolderId,
  });
