import { search, search2, search3 } from "@/services/openSubsonic/searching";
import { useQuery } from "@tanstack/react-query";

export const useSearch = (params: { artist?: string, album?: string, title?: string, any?: string, count?: number, offset?: number, newerThan?: number }) => {
  return useQuery({
    queryKey: ["search", params],
    queryFn: () => {
      return search(params);
    },
  });
};

export const useSearch2 = (query: string, params: { artistCount?: number, artistOffset?: number, albumCount?: number, albumOffset?: number, songCount?: number, songOffset?: number, musicFolderId?: string }) => {
  return useQuery({
    queryKey: ["search2", query, params],
    queryFn: () => {
      return search2(query, params);
    },
  });
};

export const useSearch3 = (query: string, params: { artistCount?: number, artistOffset?: number, albumCount?: number, albumOffset?: number, songCount?: number, songOffset?: number, musicFolderId?: string }) => {
  return useQuery({
    queryKey: ["search3", query, params],
    queryFn: () => {
      return search3(query, params);
    },
    enabled: query.length > 0,
  });
};
