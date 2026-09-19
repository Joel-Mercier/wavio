import type { QueryClient } from "@tanstack/react-query";

// A counted play bumps the server's play_date/play_count, which reorders the
// "recent"/"frequent" album lists and the "most played tracks" list. Those back
// both the Home carousels and the home-screen widget's recent strip;
// `refetchType: "all"` so the widget's observer-less cache entry refetches too.
export function invalidatePlayCountQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    refetchType: "all",
    predicate: (query) => {
      const [name, params] = query.queryKey as [
        string,
        { type?: string } | undefined,
      ];
      if (name === "mostPlayedSongs" || name === "mostPlayedSongs:infinite") {
        return true;
      }
      if (name !== "albumList2" && name !== "albumList2:infinite") {
        return false;
      }
      return params?.type === "recent" || params?.type === "frequent";
    },
  });
}
