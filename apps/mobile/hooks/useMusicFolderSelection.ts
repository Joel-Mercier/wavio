import { useEffect } from "react";
import { useMusicFolders } from "@/hooks/backend/useBrowsing";
import { useAuthBase } from "@/stores/auth";
import {
  useCurrentAuthScope,
  useCurrentMusicFolderId,
  useMusicFoldersBase,
} from "@/stores/musicFolders";
import { reconcileMusicFolderSelection } from "@/utils/musicFolderSelection";

// Keep the persisted music-folder selection in sync with what the server
// actually has, falling back when the selected folder no longer exists (see
// reconcileMusicFolderSelection for the rules). Wired once at the app root.
export default function useMusicFolderSelection() {
  const serverType = useAuthBase((s) => s.serverType);
  const scope = useCurrentAuthScope();
  const current = useCurrentMusicFolderId();
  const setCurrentFolder = useMusicFoldersBase((s) => s.setCurrentFolder);
  const { data, isSuccess } = useMusicFolders();

  useEffect(() => {
    // Only act on a confirmed folder list — never clear a valid selection just
    // because the request is still loading, errored, or the server is offline.
    if (!scope || !isSuccess) return;
    const result = reconcileMusicFolderSelection({
      serverType,
      current,
      folders: data?.musicFolders?.musicFolder ?? [],
    });
    if (result.action === "set") setCurrentFolder(scope, result.id);
  }, [serverType, scope, current, data, isSuccess, setCurrentFolder]);
}
