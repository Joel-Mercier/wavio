import type { QueryKey } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import type { Href } from "expo-router";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Folder from "lucide-react-native/dist/esm/icons/folder.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import LibraryBig from "lucide-react-native/dist/esm/icons/library-big.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import Users from "lucide-react-native/dist/esm/icons/users.mjs";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import type { LibraryLayout } from "@/app/(app)/(tabs)/(library)/index";
import DownloadedBadge from "@/components/DownloadedBadge";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useIsCollectionAvailableOffline,
  useIsDetailCached,
  useOfflineModeEnabled,
} from "@/hooks/offline";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import type { PodcastSource } from "@/stores/podcasts";
import useRadioStations, {
  type RadioStationSource,
} from "@/stores/radioStations";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

export type Favorites = {
  name: string;
  isFavorites: boolean;
  songCount: number;
};
export type LibraryPodcast = {
  isPodcast?: boolean;
  imageUrl?: string;
  authorName?: string;
  description?: string;
  // "taddy" podcasts open the Taddy series screen; "server" podcasts open the
  // OpenSubsonic channel screen.
  podcastSource?: PodcastSource;
  coverArt?: string;
  url?: string;
};
export type LibraryFolder = {
  isFolder?: boolean;
};
export type LibraryAllAlbums = {
  isAllAlbums?: boolean;
};
export type LibraryAllArtists = {
  isAllArtists?: boolean;
};
export type LibraryRadioStation = {
  isRadioStation?: boolean;
  imageUrl?: string;
  streamUrl?: string;
  homePageUrl?: string;
  tags?: string;
  source?: RadioStationSource;
};
interface LibraryListItemProps {
  item: Playlist &
    AlbumID3 &
    ArtistID3 &
    Favorites &
    LibraryPodcast &
    LibraryFolder &
    LibraryRadioStation &
    LibraryAllAlbums &
    LibraryAllArtists;
  layout: LibraryLayout;
}

function LibraryListItemIcon({ type }: { type: string }) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (type === "favorites") {
    return <Heart size={24} color={white} fill={white} />;
  }
  if (type === "album") {
    return <Disc3 size={32} color={white} />;
  }
  if (type === "allAlbums") {
    return <LibraryBig size={32} color={white} />;
  }
  if (type === "allArtists") {
    return <Users size={32} color={white} />;
  }
  if (type === "artist") {
    return <User size={32} color={white} />;
  }
  if (type === "podcast") {
    return <Podcast size={32} color={white} />;
  }
  if (type === "radioStation") {
    return <Radio size={32} color={white} />;
  }
  if (type === "folder") {
    return <Folder size={32} color={white} />;
  }
  return <ListMusic size={32} color={white} />;
}

export default function LibraryListItem({
  item,
  layout,
}: LibraryListItemProps) {
  const [blue500, emerald500] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-emerald-500",
  ]) as string[];
  const { t, i18n } = useTranslation();
  const offlineModeEnabled = useOfflineModeEnabled();
  const musicFolderId = useCurrentMusicFolderId();
  const type = useMemo<{ id: string; label: string; url: Href }>(() => {
    if (item.isFavorites) {
      return {
        id: "favorites",
        label: t("app.shared.favorites"),
        url: "/favorites",
      };
    }
    if (item.isAllArtists) {
      return {
        id: "allArtists",
        label: t("app.library.allArtists"),
        url: "/artists",
      };
    }
    if (item.isAllAlbums) {
      return {
        id: "allAlbums",
        label: t("app.library.allAlbums"),
        url: "/albums",
      };
    }
    if (item.isFolder) {
      return {
        id: "folder",
        label: t("app.shared.folder_one"),
        url: {
          pathname: "/folders/[id]",
          params: { id: item.id, name: item.name, root: "1" },
        } as Href,
      };
    }
    if (item.isPodcast) {
      if (item.podcastSource === "server") {
        return {
          id: "podcast",
          label: t("app.shared.podcast_one"),
          url: {
            pathname: "/podcast-channels/[id]",
            params: {
              id: item.id,
              title: item.name,
              imageUrl: item.imageUrl,
              coverArt: item.coverArt,
              url: item.url,
              description: item.description ?? "",
            },
          } as Href,
        };
      }
      return {
        id: "podcast",
        label: t("app.shared.podcast_one"),
        url: {
          pathname: "/podcast-series/[id]",
          params: {
            id: item.id,
            uuid: item.id,
            name: item.name,
            description: item.description ?? "",
            imageUrl: item.imageUrl,
            authorName: item.authorName,
          },
        } as Href,
      };
    }
    if (item.isRadioStation) {
      return {
        id: "radioStation",
        label: t("app.shared.radioStation_one"),
        url: {
          pathname: "/internet-radio-stations/[id]",
          params: {
            id: item.id,
            name: item.name,
            streamUrl: item.streamUrl,
            homePageUrl: item.homePageUrl,
            imageUrl: item.imageUrl,
            tags: item.tags,
            source: item.source ?? "radioBrowser",
          },
        } as Href,
      };
    }
    if (item.albumCount) {
      return {
        id: "artist",
        label: t("app.shared.artist_one"),
        url: `/artists/${item.id}`,
      };
    }
    // Albums carry an `artistId` (or at least a year); playlists never do, and
    // artists are already handled above via `albumCount`. Keying off `artistId`
    // keeps albums whose tracks lack year metadata (common in local libraries)
    // from falling through to the playlist branch.
    if (item.year || item.artistId) {
      return {
        id: "album",
        label: t("app.shared.album_one"),
        url: `/albums/${item.id}`,
      };
    }
    return {
      id: "playlist",
      label: t("app.shared.playlist_one"),
      url: `/playlists/${item.id}`,
    };
  }, [item, i18n.language]);

  const updateFavoriteRadioStation = useRadioStations(
    (store) => store.updateFavoriteRadioStation,
  );

  // Server radio stations carry no cover art, so scrape the homepage for an
  // image just like InternetRadioStationListItem does. Radio-Browser stations
  // already ship an imageUrl, so skip the network round-trip for them.
  const radioMeta = useWebsiteMetadata(
    type.id === "radioStation" && item.source === "server" && !item.imageUrl
      ? item.homePageUrl
      : undefined,
  );
  const scrapedRadioImage = radioMeta.image || radioMeta["twitter:image"];
  const radioImage =
    type.id === "radioStation" ? item.imageUrl || scrapedRadioImage : undefined;

  // Persist the scraped image back onto the favorite so we don't re-scrape the
  // homepage on every render / app launch (the detail screen can miss it when
  // the user favorites before the async scrape resolves).
  useEffect(() => {
    if (
      type.id === "radioStation" &&
      item.source === "server" &&
      !item.imageUrl &&
      scrapedRadioImage
    ) {
      updateFavoriteRadioStation(item.id, { imageUrl: scrapedRadioImage });
    }
  }, [
    type.id,
    item.source,
    item.imageUrl,
    item.id,
    scrapedRadioImage,
    updateFavoriteRadioStation,
  ]);

  // Forward the resolved cover art to the detail screen so it doesn't have to
  // scrape again.
  const href = useMemo<Href>(() => {
    if (radioImage && typeof type.url === "object") {
      return {
        ...type.url,
        params: { ...type.url.params, imageUrl: radioImage },
      } as Href;
    }
    return type.url;
  }, [type.url, radioImage]);

  // Offline greying: a row is reachable offline only if its destination's
  // content query is cached. Keys must match the destination screens exactly
  // (the "all albums/artists" and root-folder browse lists are music-folder
  // scoped, and the album list is the infinite variant). Podcasts/radio have no
  // cacheable detail here, so they stay enabled (null key).
  const detailKey = useMemo<QueryKey | null>(() => {
    switch (type.id) {
      case "album":
        return ["album", item.id];
      case "artist":
        return ["artist", item.id];
      case "playlist":
        return ["playlist", item.id];
      case "favorites":
        return ["starred2"];
      case "allAlbums":
        return [
          "albumList2:infinite",
          { type: "alphabeticalByName", size: 20, musicFolderId },
        ];
      case "allArtists":
        return ["artists", { musicFolderId }];
      case "folder":
        return ["indexes", { musicFolderId: item.id }];
      default:
        return null;
    }
  }, [type.id, item.id, musicFolderId]);
  const isDetailCached = useIsDetailCached(detailKey);

  // Downloaded badge: albums/playlists show it when the collection is available
  // offline (explicitly saved, or detail cached + every track on disk);
  // favorites mirror the auto-download toggle.
  const isCollectionAvailableOffline = useIsCollectionAvailableOffline(
    type.id === "playlist" ? "playlist" : "album",
    type.id === "album" || type.id === "playlist" ? item.id : undefined,
  );
  const showDownloadedBadge =
    isCollectionAvailableOffline ||
    (type.id === "favorites" && offlineModeEnabled);

  return (
    <FadeOutScaleDown
      href={href}
      disabled={!isDetailCached && !isCollectionAvailableOffline}
      // Grid cells use symmetric horizontal padding so every column has the
      // same content width; the parent list offsets its own paddingHorizontal
      // by that amount to keep the outer edge aligned.
      className={cn("mb-4", { "px-2": layout === "grid" })}
    >
      <HStack
        className={cn("flex-row transition duration-100 items-center", {
          "flex-col items-start": layout === "grid",
        })}
      >
        <ImageWithFallback
          source={
            item.coverArt || radioImage || item.imageUrl
              ? {
                  uri:
                    radioImage ||
                    item.imageUrl ||
                    item.artistImageUrl ||
                    artworkUrl(item.coverArt),
                }
              : undefined
          }
          // Radio-station logos are often transparent PNGs with a dark mark
          // ("logo_noir"), so give them a backdrop and contain them like
          // InternetRadioStationListItem does — otherwise they render
          // invisibly on the dark background.
          contentFit={type.id === "radioStation" ? "contain" : undefined}
          // size="none" so the Image's default md size (h-20 w-20) isn't injected;
          // in grid the class only sets w-full, and a stray h-20 would make cover
          // art shorter than the square fallback boxes (favorites/folders).
          size="none"
          className={cn("rounded-md aspect-square", {
            "w-full": layout === "grid",
            "w-20 h-20": layout === "list",
            "rounded-full": type.id === "artist",
            "bg-primary-600": type.id === "radioStation",
          })}
          alt="Libray item cover"
          fallback={
            <Box
              className={cn(
                "rounded-md bg-primary-600 items-center justify-center overflow-hidden aspect-square",
                {
                  "w-full": layout === "grid",
                  "w-20 h-20": layout === "list",
                  "rounded-full": type.id === "artist",
                },
              )}
            >
              {type.id === "favorites" ? (
                <LinearGradient
                  colors={[blue500, emerald500]}
                  style={{
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  className="w-full h-full items-center justify-center"
                >
                  <LibraryListItemIcon type={type.id} />
                </LinearGradient>
              ) : (
                <LibraryListItemIcon type={type.id} />
              )}
            </Box>
          }
        />
        <VStack
          className={cn("ml-4 flex-1", { "ml-0 mt-2": layout === "grid" })}
        >
          <Heading
            numberOfLines={layout === "grid" ? 2 : 1}
            className="text-white text-md font-normal capitalize"
          >
            {item.isFavorites || item.isAllAlbums || item.isAllArtists
              ? type.label
              : item.name}
          </Heading>
          <HStack className="items-center w-full">
            {showDownloadedBadge && <DownloadedBadge className="mr-2" />}
            <Text numberOfLines={1} className="text-md text-primary-100 flex-1">
              {type.id === "podcast"
                ? item.authorName
                  ? `${type.label} ⦁ ${item.authorName}`
                  : type.label
                : type.id === "radioStation"
                  ? item.tags
                    ? `${type.label} ⦁ ${item.tags}`
                    : type.label
                  : type.id === "allAlbums"
                    ? t("app.shared.album_other")
                    : type.id === "allArtists"
                      ? t("app.shared.artist_other")
                      : type.id === "artist"
                        ? `${type.label} ⦁ ${t("app.shared.albumCount", { count: item.albumCount ?? 0 })}`
                        : type.id === "folder"
                          ? type.label
                          : type.id === "playlist"
                            ? `${type.label} ⦁ ${t("app.shared.songCount", { count: item.songCount ?? 0 })}${item.owner ? ` ⦁ ${item.owner}` : ""}`
                            : `${type.label} ⦁ ${t("app.shared.songCount", { count: item.songCount ?? 0 })}`}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
