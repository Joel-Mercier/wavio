import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCurrentAuthScope } from "@/stores/auth";
import {
  type MusicFolderSelection,
  useMusicFoldersBase,
} from "@/stores/musicFolders";

const FOLDER_QUERY_PREFIXES = [
  "albumList2",
  "albumList2:infinite",
  "albumList",
  "leastPlayedAlbums",
  "leastPlayedAlbums:infinite",
  "starred2",
  "starred",
  "search3",
  "search2",
  "artists",
  "artistAppearances",
  "indexes",
  "genres",
  "randomSongs",
  "songs:infinite",
  "songsByGenre",
  "mostPlayedSongs",
  "mostPlayedSongs:infinite",
];

// Store a new library selection and mark what it scopes as stale. Every query
// key already carries the selection, so mounted screens fetch the new keys as
// they re-render; refetching here would only re-run the outgoing selection's
// queries, which are still the active ones until that re-render.
export default function useApplyMusicFolderSelection() {
  const queryClient = useQueryClient();
  const scope = useCurrentAuthScope();
  const setCurrentFolders = useMusicFoldersBase((s) => s.setCurrentFolders);

  return useCallback(
    (ids: MusicFolderSelection) => {
      if (!scope) return;
      setCurrentFolders(scope, ids);
      for (const prefix of FOLDER_QUERY_PREFIXES) {
        queryClient.invalidateQueries({
          queryKey: [prefix],
          refetchType: "none",
        });
      }
    },
    [scope, setCurrentFolders, queryClient],
  );
}
