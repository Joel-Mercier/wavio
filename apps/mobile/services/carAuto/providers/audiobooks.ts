import { absServerUrl } from "@/services/audiobookshelf";
import { audiobookCoverUrl } from "@/services/audiobookshelf/keys";
import {
  getItemsInProgress,
  getLibraryItems,
} from "@/services/audiobookshelf/library";
import type { AbsLibraryItem } from "@/services/audiobookshelf/types";
import { useAudiobookshelfBase } from "@/stores/audiobookshelf";
import { encodeMediaId } from "../mediaId";
import { t } from "../nodes";
import type { BrowseNode } from "../types";
import type { Listing } from "./shared";

const RECENT_LIMIT = 50;

const bookNode = (item: AbsLibraryItem, groupTitle: string): BrowseNode => {
  const progress = item.userMediaProgress;
  return {
    id: encodeMediaId({ kind: "book", id: item.id }),
    title: item.media.metadata.title ?? "",
    subtitle: item.media.metadata.authorName,
    artworkUrl: audiobookCoverUrl(absServerUrl(), item.id),
    playable: true,
    groupTitle,
    completion: progress
      ? progress.isFinished
        ? 1
        : Math.min(1, Math.max(0, progress.progress))
      : 0,
  };
};

export async function audiobooksListing(): Promise<Listing> {
  const libraryId = useAudiobookshelfBase.getState().libraryId;
  const [inProgress, recent] = await Promise.all([
    getItemsInProgress().catch(() => [] as AbsLibraryItem[]),
    libraryId
      ? getLibraryItems({
          libraryId,
          page: 0,
          limit: RECENT_LIMIT,
          sort: "addedAt",
          desc: true,
        })
          .then((page) => page.results)
          .catch(() => [] as AbsLibraryItem[])
      : Promise.resolve([] as AbsLibraryItem[]),
  ]);
  const books = inProgress.filter((item) => item.mediaType === "book");
  const continuing = new Set(books.map((item) => item.id));
  return {
    nodes: [
      ...books.map((item) => bookNode(item, t("continueListening"))),
      ...recent
        .filter((item) => item.mediaType === "book" && !continuing.has(item.id))
        .map((item) => bookNode(item, t("recentlyAdded"))),
    ],
  };
}
