import { useMemo } from "react";
import useApp from "@/stores/app";
import usePlaylists from "@/stores/playlists";
import type { PlaylistFolderOptions } from "@/utils/playlistFolders";

export function usePlaylistFolderOptions(): PlaylistFolderOptions {
  const detect = useApp((store) => store.playlistFolderDetection);
  const separator = useApp((store) => store.playlistFolderSeparator);
  const folders = usePlaylists((store) => store.playlistFolders);
  const assignments = usePlaylists((store) => store.playlistFolderAssignments);
  return useMemo(
    () => ({ detect, separator, folders, assignments }),
    [detect, separator, folders, assignments],
  );
}
