import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { RecentSearch } from "@/stores/recentSearches";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";
import { type Href, Link } from "expo-router";
import {
  AudioLines,
  Clock,
  Disc3,
  ListMusic,
  User,
  X,
} from "lucide-react-native";
import { useMemo } from "react";

function RecentSearchListItemIcon({ type }: { type: RecentSearch["type"] }) {
  if (type === "song") {
    return (
      <AudioLines
        size={24}
        color={themeConfig.theme.colors.white}
        fill={themeConfig.theme.colors.white}
      />
    );
  }
  if (type === "album") {
    return <Disc3 size={24} color={themeConfig.theme.colors.white} />;
  }
  if (type === "artist") {
    return <User size={24} color={themeConfig.theme.colors.white} />;
  }
  if (type === "playlist") {
    return <ListMusic size={24} color={themeConfig.theme.colors.white} />;
  }
  return <Clock size={24} color={themeConfig.theme.colors.white} />;
}

export default function RecentSearchListItem({
  recentSearch,
  handleDeletePress,
}: { recentSearch: RecentSearch; handleDeletePress: (id: string) => void }) {
  const url = useMemo<Href>(() => {
    if (recentSearch.type === "query") {
      return `/search-results?query=${recentSearch.title}`;
    }
    if (recentSearch.type === "artist") {
      return `/artists/${recentSearch.id}`;
    }
    if (recentSearch.type === "album") {
      return `/albums/${recentSearch.id}`;
    }
    if (recentSearch.type === "playlist") {
      return `/playlists/${recentSearch.id}`;
    }
    if (recentSearch.type === "song") {
      return `/albums/${recentSearch.albumId}`;
    }
  }, [recentSearch]);

  return (
    <Link href={url} asChild>
      <FadeOutScaleDown>
        <HStack className="items-center justify-between mb-4">
          <HStack className="items-center">
            {recentSearch.coverArt ? (
              <Image
                source={{ uri: artworkUrl(recentSearch.coverArt) }}
                className="w-16 h-16 rounded-md aspect-square"
                alt="Recent search cover"
              />
            ) : (
              <Box
                className={cn(
                  "w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center",
                  {
                    "rounded-full":
                      recentSearch.type === "query" ||
                      recentSearch.type === "artist",
                  },
                )}
              >
                <RecentSearchListItemIcon type={recentSearch.type} />
              </Box>
            )}
            <VStack className="ml-4">
              <Heading className="text-white font-normal" numberOfLines={1}>
                {recentSearch.title}
              </Heading>
              {recentSearch.type !== "query" && (
                <Text className="text-primary-100 capitalize" numberOfLines={1}>
                  {recentSearch.type}
                </Text>
              )}
              {recentSearch.artist && (
                <Text className="text-primary-100" numberOfLines={1}>
                  {recentSearch.artist}
                </Text>
              )}
            </VStack>
          </HStack>
          <FadeOutScaleDown onPress={() => handleDeletePress(recentSearch.id)}>
            <X size={24} color={themeConfig.theme.colors.gray[400]} />
          </FadeOutScaleDown>
        </HStack>
      </FadeOutScaleDown>
    </Link>
  );
}
