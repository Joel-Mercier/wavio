import type { LibraryLayout } from "@/app/(tabs)/library";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
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
import { Link } from "expo-router";
import { Disc3, ListMusic, User } from "lucide-react-native";
import { useMemo } from "react";
import Animated from "react-native-reanimated";

interface LibraryListItemProps {
  item: Playlist & AlbumID3 & ArtistID3;
  layout: LibraryLayout;
}

function LibraryListItemIcon({ type }: { type: string }) {
  if (type === "Album") {
    return <Disc3 size={48} color={themeConfig.theme.colors.white} />;
  }
  if (type === "Artist") {
    return <User size={48} color={themeConfig.theme.colors.white} />;
  }
  return <ListMusic size={48} color={themeConfig.theme.colors.white} />;
}

export default function LibraryListItem({
  item,
  layout,
}: LibraryListItemProps) {
  const cover = useGetCoverArt(item.coverArt, { size: 200 });
  const type = useMemo(() => {
    if (item.albumCount) {
      return { label: "Artist", url: "/artists" };
    }
    if (item.year) {
      return { label: "Album", url: "/albums" };
    }
    return { label: "Playlist", url: "/playlists" };
  }, [item]);

  return (
    <Link href={`${type.url}/${item.id}`} className="mb-4" asChild>
      <Pressable>
        {({ pressed }) => (
          <Animated.View
            className={cn("flex-row transition duration-100 items-center", {
              "flex-col items-start": layout === "grid",
            })}
            style={{
              transform: [{ scale: pressed ? 0.98 : 1 }],
              opacity: pressed ? 0.5 : 1,
            }}
          >
            {cover.data ? (
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
            ) : (
              <Box
                className={cn(
                  "rounded-md bg-primary-600 items-center justify-center",
                  {
                    "w-full": layout === "grid",
                    "w-20 h-20": layout === "list",
                  },
                )}
              >
                <LibraryListItemIcon type={type.label} />
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
                {type.label === "Artist"
                  ? item.albumCount > 1
                    ? "albums"
                    : "album"
                  : item.songCount > 1
                    ? "songs"
                    : "song"}
              </Text>
            </VStack>
          </Animated.View>
        )}
      </Pressable>
    </Link>
  );
}
