import { useQuery } from "@tanstack/react-query";
import { useOfflineSearch3 } from "@/hooks/offline";
import { useIsOnline } from "@/hooks/useIsOnline";
import { search, search2, search3 } from "@/services/backend/searching";
import { withKanaFallback } from "@/services/kanaSearchFallback";

// The interactive searches retry an empty first page with the kana / romaji
// forms of the query. Applied here rather than in services/backend so the bulk
// callers (services/libraryMatch matches ~50 external tracks and misses as a
// matter of course) don't fan out on every miss.
const search2WithKana = withKanaFallback(
  search2,
  (envelope) => envelope.searchResult2,
  (envelope, searchResult2) => ({ ...envelope, searchResult2 }),
);
const search3WithKana = withKanaFallback(
  search3,
  (envelope) => envelope.searchResult3,
  (envelope, searchResult3) => ({ ...envelope, searchResult3 }),
);

export const useSearch = (params: {
  artist?: string;
  album?: string;
  title?: string;
  any?: string;
  count?: number;
  offset?: number;
  newerThan?: number;
}) => {
  return useQuery({
    queryKey: ["search", params],
    queryFn: () => {
      return search(params);
    },
  });
};

export const useSearch2 = (
  query: string,
  params: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
    musicFolderId?: string;
  },
) => {
  return useQuery({
    queryKey: ["search2", query, params],
    queryFn: () => {
      return search2WithKana(query, params);
    },
  });
};

export const useSearch3 = (
  query: string,
  params: {
    artistCount?: number;
    artistOffset?: number;
    albumCount?: number;
    albumOffset?: number;
    songCount?: number;
    songOffset?: number;
    musicFolderId?: string;
  },
  // Lets a caller that renders the results behind a tab hold the search back
  // until that tab is actually shown.
  { enabled = true }: { enabled?: boolean } = {},
) => {
  // Offline (server unreachable), the server query is paused by onlineManager and
  // returns nothing; branch to a synchronous search over downloads + persisted
  // cache instead. Both hooks run unconditionally (rules of hooks); we return the
  // one matching the effective connectivity. On reconnect `isOnline` flips → the
  // server query enables and refetches. The local backend is always effectively
  // online, so it keeps its SQLite FTS path.
  const isOnline = useIsOnline();
  const serverQuery = useQuery({
    queryKey: ["search3", query, params],
    queryFn: () => {
      return search3WithKana(query, params);
    },
    enabled: enabled && query.length > 0 && isOnline,
  });
  const offline = useOfflineSearch3(query, params, {
    enabled: enabled && !isOnline,
  });
  return isOnline ? serverQuery : offline;
};
