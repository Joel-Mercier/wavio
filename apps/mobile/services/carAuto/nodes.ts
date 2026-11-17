import type { TOptions } from "i18next";
import i18n from "@/config/i18n";
import { currentLibraryCapabilities } from "@/services/libraryContext";
import type {
  AlbumID3,
  ArtistID3,
  Child,
  Playlist,
} from "@/services/openSubsonic/types";
import { carAutoSettings } from "@/stores/carAuto";
import useOffline, { type OfflineCollection } from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";
import { encodeMediaId, trackId } from "./mediaId";
import type {
  BrowseNode,
  CarIcon,
  ContentStyle,
  DownloadState,
  ItemAction,
} from "./types";

export const CAR_ARTWORK_SIZE = 600;

// Rows listed under one parent. The host parcels a parent whole on every open,
// and nobody scrolls past this from a car; a tap still queues the full list.
export const CAR_LIST_LIMIT = 200;

export const t = (key: string, options: TOptions = {}): string =>
  i18n.t(`app.carAuto.${key}`, options);

export const cover = (id?: string): string | undefined =>
  id ? artworkUrl(id, CAR_ARTWORK_SIZE) : undefined;

const enabledActions = (candidates: ItemAction[]): ItemAction[] => {
  const { itemActions } = carAutoSettings();
  const capabilities = currentLibraryCapabilities();
  return candidates.filter((action) => {
    if (!itemActions[action]) return false;
    if (action === "download") return capabilities.offlineDownload;
    return true;
  });
};

const favoriteAction = (starred: unknown): ItemAction =>
  starred ? "favoriteRemove" : "favoriteAdd";

// Android Auto plays a node that is both playable and browsable instead of
// opening it, so a collection is playable only when the driver chose that.
export const playsOnTap = (): boolean =>
  carAutoSettings().collectionTap === "play";

export const SUB_ICONS: Record<
  "albums" | "artists" | "playlists" | "songs",
  CarIcon
> = {
  albums: "albums",
  artists: "artists",
  playlists: "playlists",
  songs: "songs",
};

export const styleFor = (
  target: "albums" | "playlists" | "artists" | "genres",
): ContentStyle => carAutoSettings().displayStyles[target];

function collectionDownload(
  kind: OfflineCollection["kind"],
  id: string,
): DownloadState | undefined {
  if (!currentLibraryCapabilities().offlineDownload) return undefined;
  const saved = useOffline.getState().downloadedCollections[id];
  return saved?.kind === kind ? "downloaded" : undefined;
}

function trackDownload(id: string): DownloadState | undefined {
  return useOffline.getState().isTrackDownloaded(id) ? "downloaded" : undefined;
}

export const albumNode = (
  album: AlbumID3,
  itemStyle?: ContentStyle,
): BrowseNode => ({
  id: encodeMediaId({ kind: "album", id: album.id }),
  title: album.name,
  subtitle: album.artist,
  artworkUrl: cover(album.coverArt),
  playable: playsOnTap(),
  browsable: true,
  childrenStyle: "list",
  itemStyle,
  download: collectionDownload("album", album.id),
  actions: enabledActions([
    favoriteAction(album.starred),
    "playNext",
    "shuffle",
    "radio",
    "addToQueue",
    "download",
  ]),
});

export const playlistNode = (
  playlist: Playlist,
  itemStyle?: ContentStyle,
): BrowseNode => ({
  id: encodeMediaId({ kind: "playlist", id: playlist.id }),
  title: playlist.name,
  subtitle: playlist.songCount
    ? t("songCount", { count: playlist.songCount })
    : undefined,
  artworkUrl: cover(playlist.coverArt),
  playable: playsOnTap(),
  browsable: true,
  childrenStyle: "list",
  itemStyle,
  download: collectionDownload("playlist", playlist.id),
  actions: enabledActions(["shuffle", "playNext", "addToQueue", "download"]),
});

export const artistNode = (
  artist: Pick<ArtistID3, "id" | "name" | "coverArt" | "starred">,
  extras: Partial<BrowseNode> = {},
): BrowseNode => ({
  id: encodeMediaId({ kind: "artist", id: artist.id }),
  title: artist.name,
  artworkUrl: cover(artist.coverArt),
  playable: playsOnTap(),
  browsable: true,
  childrenStyle: "list",
  actions: enabledActions([favoriteAction(artist.starred), "radio", "shuffle"]),
  ...extras,
});

export const trackNode = (
  song: Child,
  parentId: string,
  extras: Partial<BrowseNode> = {},
): BrowseNode => ({
  id: trackId(parentId, song.id),
  title: song.title ?? t("unknownTitle"),
  subtitle: song.artist,
  artworkUrl: cover(song.coverArt),
  playable: true,
  explicit: song.explicitStatus === "explicit" || undefined,
  download: trackDownload(song.id),
  actions: enabledActions([
    favoriteAction(song.starred),
    "radio",
    "playNext",
    "addToQueue",
  ]),
  ...extras,
});

export const sectionNode = (
  id: string,
  title: string,
  extras: Partial<BrowseNode> = {},
): BrowseNode => ({
  id,
  title,
  playable: false,
  browsable: true,
  childrenStyle: "list",
  ...extras,
});

export const grouped = (
  nodes: BrowseNode[],
  groupTitle: string,
): BrowseNode[] => nodes.map((node) => ({ ...node, groupTitle }));
