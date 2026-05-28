import { LinearGradient } from "expo-linear-gradient";
import type { Href } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Folder from "lucide-react-native/dist/esm/icons/folder.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import type { LibraryLayout } from "@/app/(app)/(tabs)/(library)/index";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
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
};
export type LibraryFolder = {
  isFolder?: boolean;
};
interface LibraryListItemProps {
  item: Playlist &
    AlbumID3 &
    ArtistID3 &
    Favorites &
    LibraryPodcast &
    LibraryFolder;
  layout: LibraryLayout;
  index: number;
}

function LibraryListItemIcon({ type }: { type: string }) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (type === "favorites") {
    return <Heart size={24} color={white} fill={white} />;
  }
  if (type === "album") {
    return <Disc3 size={32} color={white} />;
  }
  if (type === "artist") {
    return <User size={32} color={white} />;
  }
  if (type === "podcast") {
    return <Podcast size={32} color={white} />;
  }
  if (type === "folder") {
    return <Folder size={32} color={white} />;
  }
  return <ListMusic size={32} color={white} />;
}

export default function LibraryListItem({
  item,
  layout,
  index,
}: LibraryListItemProps) {
  const [blue500, emerald500, black] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-emerald-500",
    "--color-black",
  ]) as string[];
  const { t, i18n } = useTranslation();
  const { offlineModeEnabled } = useOfflineDownloads();
  const type = useMemo<{ id: string; label: string; url: Href }>(() => {
    if (item.isFavorites) {
      return {
        id: "favorites",
        label: t("app.shared.favorites"),
        url: "/favorites",
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
    if (item.albumCount) {
      return {
        id: "artist",
        label: t("app.shared.artist_one"),
        url: `/artists/${item.id}`,
      };
    }
    if (item.year) {
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

  const gridColumn = index % 3;
  const gridMarginClass = useMemo(() => {
    if (layout !== "grid") return "";
    if (gridColumn === 0) return "mr-2 ml-0";
    if (gridColumn === 1) return "mx-2";
    return "ml-2 mr-0";
  }, [layout, gridColumn]);

  return (
    <FadeOutScaleDown href={type.url} className={cn("mb-4", gridMarginClass)}>
      <HStack
        className={cn("flex-row transition duration-100 items-center", {
          "flex-col items-start": layout === "grid",
        })}
      >
        {item.coverArt || item.imageUrl ? (
          <HStack>
            <Image
              source={{
                uri:
                  item.imageUrl ||
                  item.artistImageUrl ||
                  artworkUrl(item.coverArt),
              }}
              className={cn("rounded-md aspect-square", {
                "w-full": layout === "grid",
                "w-20 h-20": layout === "list",
                "rounded-full": type.id === "artist",
              })}
              alt="Libray item cover"
            />
          </HStack>
        ) : (
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
        )}
        <VStack
          className={cn("ml-4 flex-1", { "ml-0 mt-2": layout === "grid" })}
        >
          <Heading
            numberOfLines={layout === "grid" ? 2 : 1}
            className="text-white text-md font-normal capitalize"
          >
            {item.isFavorites ? type.label : item.name}
          </Heading>
          <HStack className="items-center">
            {offlineModeEnabled && type.id === "favorites" && (
              <Box className="size-4 rounded-full bg-emerald-500 items-center justify-center mr-2">
                <ArrowDown size={12} color={black} />
              </Box>
            )}
            <Text numberOfLines={1} className="text-md text-primary-100">
              {type.id === "podcast"
                ? `${type.label} ⦁ ${item.authorName}`
                : type.id === "artist"
                  ? `${type.label} ⦁ ${t("app.shared.albumCount", { count: item.albumCount })}`
                  : type.id === "folder"
                    ? type.label
                    : type.id === "playlist"
                      ? `${type.label} ⦁ ${t("app.shared.songCount", { count: item.songCount })}${item.owner ? ` ⦁ ${item.owner}` : ""}`
                      : `${type.label} ⦁ ${t("app.shared.songCount", { count: item.songCount })}`}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
