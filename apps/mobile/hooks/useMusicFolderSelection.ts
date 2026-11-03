import { useEffect } from "react";
import { useMusicFolders } from "@/hooks/backend/useBrowsing";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useAuthBase, useCurrentAuthScope } from "@/stores/auth";
import {
  useCurrentMusicFolderIds,
  useMusicFoldersBase,
} from "@/stores/musicFolders";
import { reconcileMusicFolderSelection } from "@/utils/musicFolderSelection";

// Keep the persisted music-folder selection in sync with what the server
// actually has, falling back when the selected folders no longer exist (see
// reconcileMusicFolderSelection for the rules). Wired once at the app root.
export default function useMusicFolderSelection() {
  const serverType = useAuthBase((s) => s.serverType);
  const { multiMusicFolderSelection } = useCapabilities();
  const scope = useCurrentAuthScope();
  const current = useCurrentMusicFolderIds();
  const setCurrentFolders = useMusicFoldersBase((s) => s.setCurrentFolders);
  const { data, isSuccess } = useMusicFolders();

  useEffect(() => {
    // Only act on a confirmed folder list — never clear a valid selection just
    // because the request is still loading, errored, or the server is offline.
    if (!scope || !isSuccess) return;
    const result = reconcileMusicFolderSelection({
      serverType,
      multiSelect: multiMusicFolderSelection,
      current,
      folders: data?.musicFolders?.musicFolder ?? [],
    });
    if (result.action === "set") setCurrentFolders(scope, result.ids);
  }, [
    serverType,
    multiMusicFolderSelection,
    scope,
    current,
    data,
    isSuccess,
    setCurrentFolders,
  ]);
}
