import useApp from "@/stores/app";
import {
  type MusicFolderSelection,
  useCurrentMusicFolderIds,
} from "@/stores/musicFolders";

// The Search tab's scope: every library when the user asked search to ignore
// the selection (issue #259), the browsing selection otherwise.
export default function useSearchMusicFolderIds(): MusicFolderSelection {
  const musicFolderIds = useCurrentMusicFolderIds();
  const searchAllLibraries = useApp((s) => s.searchAllLibraries);
  return searchAllLibraries ? undefined : musicFolderIds;
}
