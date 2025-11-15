import type { LibraryLayout } from "@/app/(app)/(tabs)/(library)/index";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowDown, Disc3, Heart, ListMusic, User } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export type Favorites = {
  name: string;
  isFavorites: boolean;
  songCount: number;
};
interface LibraryListItemProps {
  item: Playlist & AlbumID3 & ArtistID3 & Favorites;
  layout: LibraryLayout;
  index: number;
}

function LibraryListItemIcon({ type }: { type: string }) {
  if (type === "favorites") {
    return (
      <Heart
        size={24}
        color={themeConfig.theme.colors.white}
        fill={themeConfig.theme.colors.white}
      />
    );
  }
  if (type === "album") {
    return <Disc3 size={48} color={themeConfig.theme.colors.white} />;
  }
  if (type === "artist") {
    return <User size={48} color={themeConfig.theme.colors.white} />;
  }
  return <ListMusic size={48} color={themeConfig.theme.colors.white} />;
}

export default function LibraryListItem({
  item,
  layout,
  index,
}: LibraryListItemProps) {
  const { t, i18n } = useTranslation();
  const { offlineModeEnabled } = useOfflineDownloads();
  const type = useMemo(() => {
    if (item.isFavorites) {
      return {
        id: "favorites",
        label: t("app.shared.favorites"),
        url: "/(tabs)/(library)/favorites",
      };
    }
    if (item.albumCount) {
      return {
        id: "artist",
        label: t("app.shared.artist_one"),
        url: `/(tabs)/(library)/artists/${item.id}`,
      };
    }
    if (item.year) {
      return {
        id: "album",
        label: t("app.shared.album_one"),
        url: `/(tabs)/(library)/albums/${item.id}`,
      };
    }
    return {
      id: "playlist",
      label: t("app.shared.playlist_one"),
      url: `/(tabs)/(library)/playlists/${item.id}`,
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
        {item.coverArt ? (
          <HStack>
            <Image
              source={{
                uri: item.artistImageUrl || artworkUrl(item.coverArt),
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
                colors={[
                  themeConfig.theme.colors.blue[500],
                  themeConfig.theme.colors.emerald[500],
                ]}
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
        <VStack className={cn("ml-4", { "ml-0 mt-2": layout === "grid" })}>
          <Heading
            numberOfLines={layout === "grid" ? 2 : 1}
            className="text-white text-md font-normal capitalize"
          >
            {item.name}
          </Heading>
          <HStack className="items-center">
            {offlineModeEnabled && type.id === "favorites" && (
              <Box className="size-4 rounded-full bg-emerald-500 items-center justify-center mr-2">
                <ArrowDown size={12} color={themeConfig.theme.colors.black} />
              </Box>
            )}
            <Text numberOfLines={1} className="text-md text-primary-100">
              {type.label} ⦁{" "}
              {type.id === "artist"
                ? t("app.shared.albumCount", { count: item.albumCount })
                : t("app.shared.songCount", { count: item.songCount })}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
