import type { LibraryLayout } from "@/app/(tabs)/library";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { LinearGradient } from "expo-linear-gradient";
import { Disc3, Heart, ListMusic, User } from "lucide-react-native";
import { useMemo } from "react";

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
  const cover = useGetCoverArt(item.coverArt, { size: 200 }, !!item.coverArt);
  const type = useMemo(() => {
    if (item.isFavorites) {
      return { id: "favorites", label: "Playlist", url: "/favorites" };
    }
    if (item.albumCount) {
      return { id: "artist", label: "Artist", url: `/artists/${item.id}` };
    }
    if (item.year) {
      return { id: "album", label: "Album", url: `/albums/${item.id}` };
    }
    return { id: "playlist", label: "Playlist", url: `/playlists/${item.id}` };
  }, [item]);

  return (
    <FadeOutScaleDown
      href={type.url}
      className={cn("mb-4", {
        "mr-2 ml-0": layout === "grid" && (index + 1) % 1 === 0,
        "mx-2": layout === "grid" && (index + 1) % 2 === 0,
        "ml-2 mr-0": layout === "grid" && (index + 1) % 3 === 0,
      })}
    >
      <HStack
        className={cn("flex-row transition duration-100 items-center", {
          "flex-col items-start": layout === "grid",
        })}
      >
        {cover.data ? (
          <HStack>
            <Image
              source={{
                uri:
                  item.artistImageUrl ||
                  `data:image/jpeg;base64,${cover?.data}`,
              }}
              className={cn("rounded-md aspect-square", {
                "w-full": layout === "grid",
                "w-20 h-20": layout === "list",
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
              },
            )}
          >
            {type.id === "favorites" ? (
              <LinearGradient
                colors={[
                  themeConfig.theme.colors.blue[500],
                  themeConfig.theme.colors.emerald[500],
                ]}
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
          <Text numberOfLines={1} className="text-md text-primary-100">
            {type.label} ⦁ {item.albumCount || item.songCount}{" "}
            {type.id === "artist"
              ? item.albumCount > 1
                ? "albums"
                : "album"
              : item.songCount > 1
                ? "songs"
                : "song"}
          </Text>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
