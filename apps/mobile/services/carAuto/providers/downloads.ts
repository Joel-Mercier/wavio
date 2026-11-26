import { offlineTrackToChild } from "@/services/offline/collections";
import useOffline, { type OfflineCollection } from "@/stores/offline";
import { type DownloadsKind, encodeMediaId } from "../mediaId";
import {
  cover,
  playsOnTap,
  SUB_ICONS,
  sectionNode,
  styleFor,
  t,
} from "../nodes";
import type { BrowseNode } from "../types";
import { tracklist } from "./library";
import type { Listing } from "./shared";

export function downloadsListing(): Listing {
  return {
    nodes: (["albums", "playlists", "songs"] as const).map((of) =>
      sectionNode(
        encodeMediaId({ kind: "downloads", of }),
        t(`downloads.${of}`),
        {
          icon: SUB_ICONS[of],
          playable: of === "songs" && playsOnTap(),
          childrenStyle: of === "albums" ? styleFor("albums") : "list",
        },
      ),
    ),
  };
}

const collectionNode = (collection: OfflineCollection): BrowseNode => ({
  id: encodeMediaId({
    kind: "offlineCollection",
    id: collectionKey(collection),
  }),
  title: collection.name,
  subtitle:
    collection.kind === "album"
      ? collection.artist
      : t("songCount", { count: collection.songCount }),
  artworkUrl: cover(collection.coverArt),
  playable: playsOnTap(),
  browsable: true,
  childrenStyle: "list",
  download: "downloaded",
  itemStyle: styleFor(collection.kind === "album" ? "albums" : "playlists"),
});

const collectionKey = (collection: Pick<OfflineCollection, "kind" | "id">) =>
  `${collection.kind}-${collection.id}`;

export function downloadsKindListing(of: DownloadsKind): Listing {
  const offline = useOffline.getState();
  if (of === "songs") {
    const tracks = [...offline.getDownloadedTracksList()].sort((a, b) =>
      b.downloadedAt.localeCompare(a.downloadedAt),
    );
    return tracklist(
      encodeMediaId({ kind: "downloads", of: "songs" }),
      tracks.map(offlineTrackToChild),
      { type: "allTracks", id: "downloads", name: t("downloads.songs") },
    );
  }
  const kind = of === "albums" ? "album" : "playlist";
  const collections = offline
    .getDownloadedCollections()
    .filter((collection) => collection.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { nodes: collections.map(collectionNode) };
}

export const savedCollectionListing = (
  kind: OfflineCollection["kind"],
  id: string,
): Listing | null => offlineCollectionListing(collectionKey({ kind, id }));

export function offlineCollectionListing(key: string): Listing | null {
  const offline = useOffline.getState();
  const collection = offline
    .getDownloadedCollections()
    .find((candidate) => collectionKey(candidate) === key);
  if (!collection) return null;
  const songs = collection.trackIds
    .map((id) => offline.getDownloadedTrack(id))
    .filter((track) => track != null)
    .map(offlineTrackToChild);
  return tracklist(
    encodeMediaId({ kind: "offlineCollection", id: key }),
    songs,
    {
      type: collection.kind,
      id: collection.id,
      name: collection.name,
      coverArt: collection.coverArt,
    },
  );
}
