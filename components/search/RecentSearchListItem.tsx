import { type Href, Link } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import Clock from "lucide-react-native/dist/esm/icons/clock.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useMemo } from "react";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { RecentSearch } from "@/stores/recentSearches";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

function RecentSearchListItemIcon({ type }: { type: RecentSearch["type"] }) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (type === "song") {
    return <AudioLines size={24} color={white} fill={white} />;
  }
  if (type === "album") {
    return <Disc3 size={24} color={white} />;
  }
  if (type === "artist") {
    return <User size={24} color={white} />;
  }
  if (type === "playlist") {
    return <ListMusic size={24} color={white} />;
  }
  return <Clock size={24} color={white} />;
}

export default function RecentSearchListItem({
  recentSearch,
  handleDeletePress,
}: {
  recentSearch: RecentSearch;
  handleDeletePress: (id: string) => void;
}) {
  const [gray400] = Uniwind.getCSSVariable(["--color-gray-400"]) as string[];
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
    return "/";
  }, [recentSearch]);

  return (
    <Link href={url} asChild>
      <FadeOutScaleDown>
        <HStack className="items-center justify-between mb-4">
          <HStack className="items-center flex-1">
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
            <VStack className="mx-4 flex-1">
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
            <X size={24} color={gray400} />
          </FadeOutScaleDown>
        </HStack>
      </FadeOutScaleDown>
    </Link>
  );
}
