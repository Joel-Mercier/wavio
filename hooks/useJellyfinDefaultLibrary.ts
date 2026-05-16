import { useEffect } from "react";
import { useMusicFolders } from "@/hooks/backend/useBrowsing";
import { useAuthBase } from "@/stores/auth";
import {
  useCurrentAuthScope,
  useCurrentMusicFolderId,
  useMusicFoldersBase,
} from "@/stores/musicFolders";

export default function useJellyfinDefaultLibrary() {
  const serverType = useAuthBase((s) => s.serverType);
  const scope = useCurrentAuthScope();
  const current = useCurrentMusicFolderId();
  const setCurrentFolder = useMusicFoldersBase((s) => s.setCurrentFolder);
  const { data } = useMusicFolders();

  useEffect(() => {
    if (serverType !== "jellyfin") return;
    if (!scope) return;
    if (current !== undefined) return;
    const first = data?.musicFolders?.musicFolder?.[0];
    if (!first) return;
    setCurrentFolder(scope, String(first.id));
  }, [serverType, scope, current, data, setCurrentFolder]);
}
