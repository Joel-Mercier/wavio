import { currentLibrarySearchContext } from "@/services/libraryContext";
import type { QueueSource, QueueTrack } from "@/stores/queue";
import type { BrowseNode } from "../types";

export type Listing = {
  nodes: BrowseNode[];
  tracks?: QueueTrack[];
  source?: QueueSource;
};

export const folderIds = () => currentLibrarySearchContext().musicFolderIds;
