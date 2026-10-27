import { useTranslation } from "react-i18next";
import { useMusicFolders } from "@/hooks/backend/useBrowsing";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { MusicFolder } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import { useCurrentMusicFolderIds } from "@/stores/musicFolders";
import { summarizeMusicFolderNames } from "@/utils/musicFolderSelection";

// Roughly what the Library header fits beside the avatar and its two icons,
// with room left for a "+N" after it. A longer name still truncates.
const SUMMARY_MAX_LENGTH = 26;

export const musicFolderLabel = (folder: MusicFolder) =>
  folder.name ?? `Library ${folder.id}`;

// What a library picker needs: the server's folders, the current selection, how
// it can be changed, and a one-line summary of it.
export default function useLibraryPicker() {
  const { t } = useTranslation();
  const { musicFolderScoping, multiMusicFolderSelection } = useCapabilities();
  // Jellyfin has no "all libraries" view (see reconcileMusicFolderSelection).
  const allowAll = useAuthBase((s) => s.serverType !== "jellyfin");
  const { data, isLoading, error } = useMusicFolders();
  const selection = useCurrentMusicFolderIds();

  const folders = data?.musicFolders?.musicFolder ?? [];
  const selected = folders.filter((f) => selection?.includes(String(f.id)));
  const { text, hiddenCount } = summarizeMusicFolderNames(
    selected.map(musicFolderLabel),
    t("app.libraries.selectionSeparator"),
    SUMMARY_MAX_LENGTH,
  );
  const summary = text || t("app.libraries.allLibraries");
  const summaryExtra =
    hiddenCount > 0
      ? t("app.libraries.selectionMore", { count: hiddenCount })
      : undefined;

  return {
    folders,
    selection,
    isLoading,
    error,
    canPick: musicFolderScoping && folders.length > 1,
    multiSelect: multiMusicFolderSelection,
    allowAll,
    isNarrowed: selected.length > 0 && allowAll,
    summary,
    summaryExtra,
  };
}
