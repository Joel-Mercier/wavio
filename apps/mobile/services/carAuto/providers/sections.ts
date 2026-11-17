import {
  getAlbumList2,
  getLeastPlayedAlbums,
  getStarred2,
} from "@/services/backend/lists";
import { currentLibraryCapabilities } from "@/services/libraryContext";
import useApp from "@/stores/app";
import { isAudiobookshelfConnected } from "@/stores/audiobookshelf";
import { currentAuthScope } from "@/stores/auth";
import { carAutoSettings } from "@/stores/carAuto";
import usePodcasts, { podcastFavoritesForScope } from "@/stores/podcasts";
import useRecentPlays from "@/stores/recentPlays";
import { encodeMediaId, type RowKey, type SectionKey } from "../mediaId";
import {
  albumNode,
  artistNode,
  cover,
  playsOnTap,
  SUB_ICONS,
  sectionNode,
  styleFor,
  t,
} from "../nodes";
import type { BrowseNode, CarIcon } from "../types";
import { folderIds, type Listing } from "./shared";

const SECTION_ICONS: Record<SectionKey, CarIcon> = {
  home: "home",
  library: "library",
  downloads: "downloads",
  recent: "recent",
  favorites: "favorites",
  playlists: "playlists",
  albums: "albums",
  artists: "artists",
  genres: "genres",
  radio: "radio",
  mixes: "mixes",
  podcasts: "podcasts",
  audiobooks: "audiobooks",
};

const SECTION_STYLES: Partial<Record<SectionKey, BrowseNode["childrenStyle"]>> =
  {
    albums: "list",
  };

const ROW_SIZE = 20;

export function isSectionAvailable(key: SectionKey): boolean {
  switch (key) {
    case "downloads":
      return currentLibraryCapabilities().offlineDownload;
    case "podcasts":
      return (
        podcastFavoritesForScope(
          usePodcasts.getState().favoritePodcasts,
          currentAuthScope(),
        ).length > 0
      );
    case "audiobooks":
      return isAudiobookshelfConnected();
    default:
      return true;
  }
}

export const sectionTitle = (key: SectionKey) => t(`sections.${key}`);

export const sectionEntry = (key: SectionKey): BrowseNode =>
  sectionNode(encodeMediaId({ kind: "section", key }), sectionTitle(key), {
    icon: SECTION_ICONS[key],
    childrenStyle: SECTION_STYLES[key] ?? "list",
  });

export function rootListing(): Listing {
  const tabs = carAutoSettings().tabs.filter(isSectionAvailable);
  return {
    nodes: (tabs.length > 0 ? tabs : ["home" as const]).map(sectionEntry),
  };
}

export const rowTitle = (key: RowKey) => t(`rows.${key}`);

const rowEntry = (key: RowKey): BrowseNode =>
  sectionNode(encodeMediaId({ kind: "row", key }), rowTitle(key), {
    childrenStyle: key === "mixes" ? "list" : styleFor("albums"),
  });

export function homeListing(): Listing {
  return { nodes: carAutoSettings().homeRows.map(rowEntry) };
}

export function libraryListing(): Listing {
  return {
    nodes: carAutoSettings()
      .libraryEntries.filter(isSectionAvailable)
      .map((key) => ({ ...sectionEntry(key), itemStyle: "categoryList" })),
  };
}

const ALBUM_ROWS: RowKey[] = [
  "recentlyPlayed",
  "newest",
  "frequent",
  "highest",
  "random",
  "leastPlayed",
  "starredAlbums",
];

export function albumsListing(): Listing {
  return { nodes: ALBUM_ROWS.map(rowEntry) };
}

export function favoritesListing(): Listing {
  return {
    nodes: (["songs", "albums", "artists"] as const).map((of) =>
      sectionNode(
        encodeMediaId({ kind: "favorites", of }),
        t(`favorites.${of}`),
        {
          icon: SUB_ICONS[of],
          childrenStyle: of === "albums" ? styleFor("albums") : "list",
          playable: of === "songs" && playsOnTap(),
        },
      ),
    ),
  };
}

export async function albumRowListing(key: RowKey): Promise<Listing> {
  const musicFolderIds = folderIds();
  const style = styleFor("albums");
  if (key === "starredAlbums") {
    const rsp = await getStarred2({ musicFolderIds });
    return {
      nodes: (rsp.starred2?.album ?? []).map((album) =>
        albumNode(album, style),
      ),
    };
  }
  if (key === "leastPlayed") {
    const rsp = await getLeastPlayedAlbums({ size: ROW_SIZE, musicFolderIds });
    return {
      nodes: (rsp.albumList2?.album ?? []).map((album) =>
        albumNode(album, style),
      ),
    };
  }
  const type =
    key === "recentlyPlayed"
      ? "recent"
      : key === "newest" || key === "frequent" || key === "highest"
        ? key
        : "random";
  const rsp = await getAlbumList2(type, { size: ROW_SIZE, musicFolderIds });
  return {
    nodes: (rsp.albumList2?.album ?? []).map((album) =>
      albumNode(album, style),
    ),
  };
}

export function recentListing(): Listing {
  const plays = useRecentPlays
    .getState()
    .recentPlays.slice(0, Math.max(useApp.getState().homeShortcutsCount, 12));
  const nodes = plays.flatMap((play): BrowseNode[] => {
    switch (play.type) {
      case "album":
        return [
          {
            id: encodeMediaId({ kind: "album", id: play.id }),
            title: play.title,
            artworkUrl: cover(play.coverArt),
            playable: playsOnTap(),
            browsable: true,
            childrenStyle: "list",
          },
        ];
      case "playlist":
        return [
          {
            id: encodeMediaId({ kind: "playlist", id: play.id }),
            title: play.title,
            artworkUrl: cover(play.coverArt),
            playable: playsOnTap(),
            browsable: true,
            childrenStyle: "list",
          },
        ];
      case "artist":
        return [
          artistNode({
            id: play.id,
            name: play.title,
            coverArt: play.coverArt,
          }),
        ];
      case "favorites":
        return [
          sectionNode(
            encodeMediaId({ kind: "favorites", of: "songs" }),
            t("favorites.songs"),
            { playable: playsOnTap(), icon: "favorites" },
          ),
        ];
      case "internetRadioStation":
        return [
          {
            id: encodeMediaId({ kind: "radioStation", id: play.id }),
            title: play.title,
            artworkUrl: play.coverArt?.startsWith("http")
              ? play.coverArt
              : cover(play.coverArt),
            playable: true,
          },
        ];
      default:
        return [];
    }
  });
  return { nodes };
}
